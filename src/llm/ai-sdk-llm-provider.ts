// the model provider backed by the Vercel AI SDK. generateObject with no tools for anthropic and fireworks models. fireworks runs at temperature 0
import { anthropic } from '@ai-sdk/anthropic'
import { fireworks } from '@ai-sdk/fireworks'
import {
  APICallError,
  generateObject,
  type JSONSchema7,
  jsonSchema,
  type LanguageModel,
  NoObjectGeneratedError,
} from 'ai'
import type { LlmUsage } from '@/shared/llm'
import {
  LlmHttpError,
  type LlmProvider,
  type LlmProviderRequest,
  type LlmProviderResponse,
} from './llm-provider'
import { parseModelId } from './model-config'

// a language model instance, never a gateway model id string
export type ResolvedLanguageModel = Exclude<LanguageModel, string>

/**
 * Creates the provider that sends requests to anthropic or fireworks through the AI SDK.
 */
export function createAiSdkLlmProvider(): LlmProvider {
  return { generate: generateWithAiSdk }
}

/**
 * Returns the AI SDK language model for an anthropic/<model> or fireworks/<model> id.
 */
export function resolveLanguageModel(modelId: string): ResolvedLanguageModel {
  // pick the provider named by the id prefix
  const { provider, modelName } = parseModelId(modelId)
  if (provider === 'anthropic') {
    return anthropic(modelName)
  }
  return fireworks(modelName)
}

/**
 * Returns the temperature to send for a model id. Anthropic models get none because current Claude models reject a non-default value.
 */
export function resolveSamplingTemperature(
  modelId: string,
): number | undefined {
  const { provider } = parseModelId(modelId)
  return provider === 'anthropic' ? undefined : 0
}

// send one request and return the model's JSON unvalidated
async function generateWithAiSdk(
  request: LlmProviderRequest,
): Promise<LlmProviderResponse> {
  // the schema goes to the model without a validate function. the client validates
  const languageModel = resolveLanguageModel(request.modelId)
  const outputSchema = jsonSchema(request.outputJsonSchema as JSONSchema7)

  // call once at the model's sampling temperature. the client owns every retry
  const temperature = resolveSamplingTemperature(request.modelId)
  try {
    const generateObjectResult = await generateObject({
      model: languageModel,
      instructions: request.system,
      prompt: request.user,
      schema: outputSchema,
      ...(temperature === undefined ? {} : { temperature }),
      maxRetries: 0,
    })
    return {
      rawOutput: generateObjectResult.object,
      usage: toLlmUsage(generateObjectResult.usage),
    }
  } catch (error) {
    return handleGenerateError(error)
  }
}

// return unparseable model text as raw output, convert http errors, rethrow the rest
function handleGenerateError(error: unknown): LlmProviderResponse {
  // text the model produced that was not JSON goes to validation as a string
  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      rawOutput: error.text ?? null,
      usage: toLlmUsage(error.usage),
    }
  }

  // an http error keeps its status code for the retry decision
  if (APICallError.isInstance(error) && error.statusCode !== undefined) {
    throw new LlmHttpError({
      statusCode: error.statusCode,
      message: error.message,
      cause: error,
    })
  }
  throw error
}

// the token counts of an AI SDK usage report, with a missing count read as 0
function toLlmUsage(
  usage:
    | { inputTokens: number | undefined; outputTokens: number | undefined }
    | undefined,
): LlmUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  }
}
