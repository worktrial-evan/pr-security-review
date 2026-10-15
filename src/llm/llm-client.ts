// the llm client behind the LlmClient contract: cached, priced, retried and audited structured generate calls
import { z } from 'zod'
import type { AuditSink } from '@/shared/audit'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type {
  LlmClient,
  LlmGenerateOptions,
  LlmGenerateResult,
  LlmUsage,
} from '@/shared/llm'
import { createAiSdkLlmProvider } from './ai-sdk-llm-provider'
import {
  createLlmCacheKey,
  type LlmCacheLocation,
  readLlmCacheEntry,
  writeLlmCacheEntry,
} from './llm-cache'
import { toFailedLlmCallRecord, writeLlmCallEvent } from './llm-call-event'
import { computeCostUsd } from './llm-cost'
import { LlmOutputValidationError } from './llm-errors'
import type { LlmProvider, LlmProviderRequest } from './llm-provider'
import { retryTransientHttpErrors } from './llm-retry'
import { type ModelPrices, parseModelId } from './model-config'

// the client configuration. provider and sleep are replaced in tests, cacheDirectory defaults to the shared cache
export interface CreateLlmClientOptions {
  modelId: string
  prices: ModelPrices
  auditSink: AuditSink
  runId: string
  isCacheEnabled: boolean
  cacheDirectory?: string
  provider?: LlmProvider
  sleep?: (milliseconds: number) => Promise<void>
}

// the client configuration with every default filled in
type LlmClientSettings = Required<CreateLlmClientOptions>

// the usage reported for a cache hit, which never reaches the network
const cacheHitUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * Creates an LlmClient for the configured model, provider, prices, cache and audit sink.
 */
export function createLlmClient(options: CreateLlmClientOptions): LlmClient {
  // fill the optional settings with their defaults
  const llmClientSettings: LlmClientSettings = {
    ...options,
    cacheDirectory: options.cacheDirectory ?? resolveCacheDirectory(),
    provider: options.provider ?? createAiSdkLlmProvider(),
    sleep: options.sleep ?? Bun.sleep,
  }

  return {
    generate<T>(
      generateOptions: LlmGenerateOptions<T>,
    ): Promise<LlmGenerateResult<T>> {
      return generateAndAudit({ llmClientSettings, generateOptions })
    },
  }
}

// one generate call with the settings it runs under
interface GenerateCallOptions<T> {
  llmClientSettings: LlmClientSettings
  generateOptions: LlmGenerateOptions<T>
}

// one generate call on a resolved model id
interface ModelGenerateCallOptions<T> extends GenerateCallOptions<T> {
  modelId: string
}

// what one generate call produced, before its duration is known
interface GenerateOutcome<T> {
  output: T
  rawOutput: unknown
  usage: LlmUsage
  costUsd: number | null
  isCacheHit: boolean
}

// run one call and write its llm-call audit event, whether it succeeds or throws
async function generateAndAudit<T>({
  llmClientSettings,
  generateOptions,
}: GenerateCallOptions<T>): Promise<LlmGenerateResult<T>> {
  // start the clock and resolve the model for this call
  const startedAt = performance.now()
  const modelId = generateOptions.modelId ?? llmClientSettings.modelId
  const modelGenerateCall = { llmClientSettings, generateOptions, modelId }
  const llmCallEventContext = {
    auditSink: llmClientSettings.auditSink,
    runId: llmClientSettings.runId,
    modelId,
    llmCallIdentity: generateOptions,
  }

  // run the call and audit its result
  try {
    const { output, rawOutput, usage, costUsd, isCacheHit } =
      await generateOutput(modelGenerateCall)
    const durationMs = performance.now() - startedAt
    await writeLlmCallEvent({
      ...llmCallEventContext,
      durationMs,
      llmCallRecord: {
        status: 'success',
        rawOutput,
        usage,
        costUsd,
        isCacheHit,
      },
    })
    return { output, usage, costUsd, isCacheHit, durationMs }
  } catch (error) {
    // audit the failure, then rethrow it unchanged
    const durationMs = performance.now() - startedAt
    await writeLlmCallEvent({
      ...llmCallEventContext,
      durationMs,
      llmCallRecord: toFailedLlmCallRecord({
        error,
        modelId,
        prices: llmClientSettings.prices,
      }),
    })
    throw error
  }
}

// answer from the cache when possible, otherwise from the provider, and cache what the provider returns
async function generateOutput<T>({
  llmClientSettings,
  generateOptions,
  modelId,
}: ModelGenerateCallOptions<T>): Promise<GenerateOutcome<T>> {
  // reject an unknown provider before any lookup
  parseModelId(modelId)

  // key the request by everything that shapes the response
  const { promptId, promptHash, system, user, schema } = generateOptions
  const outputJsonSchema = toOutputJsonSchema(schema)
  const cacheKey = createLlmCacheKey({
    modelId,
    promptHash,
    system,
    user,
    outputJsonSchema,
  })
  const llmCacheLocation = {
    cacheDirectory: llmClientSettings.cacheDirectory,
    cacheKey,
  }

  // return a cached output that still passes the schema
  const cachedOutcome = llmClientSettings.isCacheEnabled
    ? await readCachedOutcome({ llmCacheLocation, schema })
    : null
  if (cachedOutcome) {
    return cachedOutcome
  }

  // ask the provider and price the call
  const validatedOutput = await requestValidatedOutput({
    llmClientSettings,
    generateOptions,
    providerRequest: { modelId, promptId, system, user, outputJsonSchema },
  })
  const costUsd = computeCostUsd({
    modelId,
    usage: validatedOutput.usage,
    prices: llmClientSettings.prices,
  })

  // store the validated raw output under the original request's key
  if (llmClientSettings.isCacheEnabled) {
    await writeLlmCacheEntry({
      ...llmCacheLocation,
      llmCacheEntry: {
        modelId,
        promptId,
        rawOutput: validatedOutput.rawOutput,
        usage: validatedOutput.usage,
        createdAt: new Date().toISOString(),
      },
    })
  }
  return { ...validatedOutput, costUsd, isCacheHit: false }
}

// convert a zod schema to the JSON schema sent to the model and used in the cache key
function toOutputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>
}

// the cache entry to read and the schema its output must pass
interface ReadCachedOutcomeOptions<T> {
  llmCacheLocation: LlmCacheLocation
  schema: z.ZodType<T>
}

// return a cache hit at zero usage and cost, or null on a miss or an entry that fails the schema
async function readCachedOutcome<T>({
  llmCacheLocation,
  schema,
}: ReadCachedOutcomeOptions<T>): Promise<GenerateOutcome<T> | null> {
  // read the entry and validate its output
  const llmCacheEntry = await readLlmCacheEntry(llmCacheLocation)
  if (!llmCacheEntry) {
    return null
  }
  const cachedOutputResult = schema.safeParse(llmCacheEntry.rawOutput)
  if (!cachedOutputResult.success) {
    return null
  }

  // a hit reports no usage and no cost
  return {
    output: cachedOutputResult.data,
    rawOutput: llmCacheEntry.rawOutput,
    usage: cacheHitUsage,
    costUsd: 0,
    isCacheHit: true,
  }
}

// the provider request and the call it belongs to
interface RequestValidatedOutputOptions<T> extends GenerateCallOptions<T> {
  providerRequest: LlmProviderRequest
}

// a provider output that passed the schema, with the usage of every attempt
interface ValidatedOutput<T> {
  output: T
  rawOutput: unknown
  usage: LlmUsage
}

// call the provider, and once more with the validation error appended when the output fails the schema
async function requestValidatedOutput<T>({
  llmClientSettings,
  generateOptions,
  providerRequest,
}: RequestValidatedOutputOptions<T>): Promise<ValidatedOutput<T>> {
  // first attempt
  const firstAttempt = await requestOutputAttempt({
    llmClientSettings,
    generateOptions,
    providerRequest,
  })
  if (firstAttempt.outputResult.success) {
    return {
      output: firstAttempt.outputResult.data,
      rawOutput: firstAttempt.rawOutput,
      usage: firstAttempt.usage,
    }
  }

  // retry once with the validation error appended to the user text
  const retryUser = appendValidationError({
    user: providerRequest.user,
    validationMessage: firstAttempt.outputResult.error.message,
  })
  const secondAttempt = await requestOutputAttempt({
    llmClientSettings,
    generateOptions,
    providerRequest: { ...providerRequest, user: retryUser },
  })
  const totalUsage = addUsage(firstAttempt.usage, secondAttempt.usage)

  // throw the typed error when the retry fails too
  if (!secondAttempt.outputResult.success) {
    throw new LlmOutputValidationError({
      promptId: providerRequest.promptId,
      modelId: providerRequest.modelId,
      validationMessage: secondAttempt.outputResult.error.message,
      rawOutput: secondAttempt.rawOutput,
      usage: totalUsage,
    })
  }
  return {
    output: secondAttempt.outputResult.data,
    rawOutput: secondAttempt.rawOutput,
    usage: totalUsage,
  }
}

// one provider response and its validation result
interface OutputAttempt<T> {
  rawOutput: unknown
  usage: LlmUsage
  outputResult: z.ZodSafeParseResult<T>
}

// call the provider with transient error retries and validate what it returns
async function requestOutputAttempt<T>({
  llmClientSettings,
  generateOptions,
  providerRequest,
}: RequestValidatedOutputOptions<T>): Promise<OutputAttempt<T>> {
  // send the request, retrying rate limits and server errors
  const { provider, sleep } = llmClientSettings
  const providerResponse = await retryTransientHttpErrors({
    operation: () => provider.generate(providerRequest),
    sleep,
  })

  // validate the response against the caller's schema
  return {
    rawOutput: providerResponse.rawOutput,
    usage: providerResponse.usage,
    outputResult: generateOptions.schema.safeParse(providerResponse.rawOutput),
  }
}

// the user text and the validation error to append to it
interface AppendValidationErrorOptions {
  user: string
  validationMessage: string
}

// add the validation error to the user text so the model can correct its output
function appendValidationError({
  user,
  validationMessage,
}: AppendValidationErrorOptions): string {
  return `${user}\n\nYour previous output failed schema validation with this error:\n${validationMessage}\nReturn output that matches the schema.`
}

// add the token counts of two attempts
function addUsage(firstUsage: LlmUsage, secondUsage: LlmUsage): LlmUsage {
  return {
    inputTokens: firstUsage.inputTokens + secondUsage.inputTokens,
    outputTokens: firstUsage.outputTokens + secondUsage.outputTokens,
  }
}
