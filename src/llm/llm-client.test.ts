// tests for the llm client against the fake provider: cache, cost, retries, validation retry and the audit event
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { type AuditEvent, auditEventSchema } from '@/shared/audit'
import type { LlmGenerateOptions } from '@/shared/llm'
import {
  createFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmRepliesByPromptId,
} from './fake-llm-provider'
import { createLlmClient } from './llm-client'
import { LlmOutputValidationError } from './llm-errors'
import { LlmHttpError } from './llm-provider'
import type { ModelPrices } from './model-config'

// the output a review call expects
const verdictSchema = z.object({
  verdict: z.enum(['safe', 'unsafe']),
  score: z.number(),
})
type Verdict = z.infer<typeof verdictSchema>

// a valid output and one that fails the schema
const unsafeVerdict: Verdict = { verdict: 'unsafe', score: 0.9 }
const invalidVerdict = { verdict: 'maybe', score: 'high' }

// the configured model at 3 USD per million input tokens and 15 per million output tokens
const configuredModelId = 'anthropic/claude-sonnet-5-5'
const samplePrices: ModelPrices = {
  [configuredModelId]: {
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
  },
}

// one generate call on the code-review prompt
const sampleGenerateOptions: LlmGenerateOptions<Verdict> = {
  promptId: 'code-review',
  promptVersion: '1',
  promptHash: 'c'.repeat(64),
  system: 'You review code for security issues.',
  user: 'Review this diff: + eval(input)',
  schema: verdictSchema,
}

// the usage every canned output reports
const sampleUsage = { inputTokens: 1000, outputTokens: 500 }

// a fresh cache directory, audit log and wait log per test
let cacheDirectory = ''
let auditEvents: AuditEvent[] = []
let sleptDelaysMs: number[] = []
beforeEach(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'llm-client-test-'))
  auditEvents = []
  sleptDelaysMs = []
})
afterEach(async () => {
  await rm(cacheDirectory, { recursive: true, force: true })
})

// silence and record the unpriced model warning
const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
afterEach(() => {
  warnSpy.mockClear()
})
afterAll(() => {
  warnSpy.mockRestore()
})

// the canned replies for the fake provider and whether the cache is on
interface TestClientOptions {
  repliesByPromptId: FakeLlmRepliesByPromptId
  isCacheEnabled?: boolean
}

// build a client on the fake provider that records audit events and skips real waits
function createTestClient({
  repliesByPromptId,
  isCacheEnabled = true,
}: TestClientOptions): {
  fakeLlmProvider: FakeLlmProvider
  llmClient: ReturnType<typeof createLlmClient>
} {
  // wire the fake provider, the temporary cache, the audit log and the wait log
  const fakeLlmProvider = createFakeLlmProvider(repliesByPromptId)
  const llmClient = createLlmClient({
    modelId: configuredModelId,
    prices: samplePrices,
    runId: 'run-1',
    isCacheEnabled,
    cacheDirectory,
    provider: fakeLlmProvider,
    auditSink: {
      write: async (auditEvent) => {
        auditEvents.push(auditEvent)
      },
    },
    sleep: async (milliseconds) => {
      sleptDelaysMs.push(milliseconds)
    },
  })
  return { fakeLlmProvider, llmClient }
}

// list the files in the llm cache directory, or none when it does not exist
async function listLlmCacheFiles(): Promise<string[]> {
  return readdir(join(cacheDirectory, 'llm')).catch(() => [])
}

describe('cache', () => {
  test('misses, then hits without the provider and at zero cost', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'output', output: unsafeVerdict, usage: sampleUsage },
        ],
      },
    })

    // the first call reaches the provider and is cached
    const firstResult = await llmClient.generate(sampleGenerateOptions)
    expect(firstResult.isCacheHit).toBe(false)
    expect(firstResult.output).toEqual(unsafeVerdict)
    expect(firstResult.costUsd).toBeCloseTo(0.0105, 10)
    expect(await listLlmCacheFiles()).toHaveLength(1)

    // the second call is answered from the cache
    const secondResult = await llmClient.generate(sampleGenerateOptions)
    expect(secondResult.isCacheHit).toBe(true)
    expect(secondResult.output).toEqual(unsafeVerdict)
    expect(secondResult.costUsd).toBe(0)
    expect(secondResult.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(fakeLlmProvider.requests).toHaveLength(1)
  })

  test('misses when the user text changes', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'output', output: unsafeVerdict }],
      },
    })

    // two calls that differ only in the user text
    await llmClient.generate(sampleGenerateOptions)
    const changedUserResult = await llmClient.generate({
      ...sampleGenerateOptions,
      user: 'Review this other diff',
    })

    expect(changedUserResult.isCacheHit).toBe(false)
    expect(fakeLlmProvider.requests).toHaveLength(2)
  })

  test('reaches the provider every time and writes nothing when disabled', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'output', output: unsafeVerdict }],
      },
      isCacheEnabled: false,
    })

    // the same call twice
    await llmClient.generate(sampleGenerateOptions)
    const secondResult = await llmClient.generate(sampleGenerateOptions)

    expect(secondResult.isCacheHit).toBe(false)
    expect(fakeLlmProvider.requests).toHaveLength(2)
    expect(await listLlmCacheFiles()).toEqual([])
  })
})

describe('validation retry', () => {
  test('retries once with the validation error appended', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'output', output: invalidVerdict, usage: sampleUsage },
          { kind: 'output', output: unsafeVerdict, usage: sampleUsage },
        ],
      },
    })

    const generateResult = await llmClient.generate(sampleGenerateOptions)

    // the second output is returned with the usage of both attempts
    expect(generateResult.output).toEqual(unsafeVerdict)
    expect(generateResult.usage).toEqual({
      inputTokens: 2000,
      outputTokens: 1000,
    })

    // the retry keeps the user text and adds the error
    const retryUser = fakeLlmProvider.requests[1]?.user ?? ''
    expect(retryUser.startsWith(sampleGenerateOptions.user)).toBe(true)
    expect(retryUser).toContain('failed schema validation')
    expect(retryUser).toContain('verdict')
  })

  test('throws the typed error and caches nothing after two failures', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'output', output: invalidVerdict }],
      },
    })

    // both attempts fail the schema
    const generateError = await llmClient
      .generate(sampleGenerateOptions)
      .catch((error: unknown) => error)

    expect(generateError).toBeInstanceOf(LlmOutputValidationError)
    expect((generateError as LlmOutputValidationError).promptId).toBe(
      'code-review',
    )
    expect((generateError as LlmOutputValidationError).modelId).toBe(
      configuredModelId,
    )
    expect(fakeLlmProvider.requests).toHaveLength(2)
    expect(await listLlmCacheFiles()).toEqual([])
  })
})

describe('http retry', () => {
  test('retries 429 with increasing waits until it succeeds', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'http-error', statusCode: 429 },
          { kind: 'http-error', statusCode: 429 },
          { kind: 'output', output: unsafeVerdict },
        ],
      },
    })

    const generateResult = await llmClient.generate(sampleGenerateOptions)

    expect(generateResult.output).toEqual(unsafeVerdict)
    expect(fakeLlmProvider.requests).toHaveLength(3)
    expect(sleptDelaysMs).toEqual([500, 1000])
  })

  test('throws the 503 after four attempts', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'http-error', statusCode: 503 }],
      },
    })

    // every attempt answers 503
    const generateError = await llmClient
      .generate(sampleGenerateOptions)
      .catch((error: unknown) => error)

    expect(generateError).toBeInstanceOf(LlmHttpError)
    expect((generateError as LlmHttpError).statusCode).toBe(503)
    expect(fakeLlmProvider.requests).toHaveLength(4)
    expect(sleptDelaysMs).toEqual([500, 1000, 2000])
  })

  test('throws a 400 without retrying', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'http-error', statusCode: 400 }],
      },
    })

    await expect(llmClient.generate(sampleGenerateOptions)).rejects.toThrow(
      'llm provider answered 400',
    )
    expect(fakeLlmProvider.requests).toHaveLength(1)
    expect(sleptDelaysMs).toEqual([])
  })
})

describe('model id', () => {
  test('returns null cost and warns for an unpriced model', async () => {
    const { llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'output', output: unsafeVerdict, usage: sampleUsage },
        ],
      },
    })

    // override the configured model with one that has no price
    const generateResult = await llmClient.generate({
      ...sampleGenerateOptions,
      modelId: 'fireworks/unpriced-model',
    })

    expect(generateResult.costUsd).toBeNull()
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
      'fireworks/unpriced-model',
    )
    expect(auditEvents[0]?.costUsd).toBeUndefined()
  })

  test('throws on an unknown provider prefix before calling the provider', async () => {
    const { fakeLlmProvider, llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'output', output: unsafeVerdict }],
      },
    })

    await expect(
      llmClient.generate({ ...sampleGenerateOptions, modelId: 'openai/gpt-x' }),
    ).rejects.toThrow('model id openai/gpt-x must start with')
    expect(fakeLlmProvider.requests).toHaveLength(0)
  })
})

describe('audit event', () => {
  test('writes one llm-call event with every field on success', async () => {
    const { llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'output', output: unsafeVerdict, usage: sampleUsage },
        ],
      },
    })

    const generateResult = await llmClient.generate(sampleGenerateOptions)

    // exactly one event, valid against the audit contract
    expect(auditEvents).toHaveLength(1)
    const llmCallEvent = auditEventSchema.parse(auditEvents[0])
    expect(llmCallEvent.kind).toBe('llm-call')
    expect(llmCallEvent.runId).toBe('run-1')
    expect(llmCallEvent.costUsd).toBeCloseTo(0.0105, 10)

    // the payload names the model, prompt, input, usage, cost, cache hit, duration and raw output
    expect(llmCallEvent.payload).toMatchObject({
      status: 'success',
      modelId: configuredModelId,
      promptId: 'code-review',
      promptVersion: '1',
      promptHash: 'c'.repeat(64),
      usage: sampleUsage,
      isCacheHit: false,
      durationMs: generateResult.durationMs,
      rawOutput: unsafeVerdict,
    })
    expect(llmCallEvent.payload.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(llmCallEvent.payload.costUsd).toBeCloseTo(0.0105, 10)
  })

  test('writes an event for a cache hit', async () => {
    const { llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'output', output: unsafeVerdict }],
      },
    })

    // a miss and then a hit
    await llmClient.generate(sampleGenerateOptions)
    await llmClient.generate(sampleGenerateOptions)

    expect(auditEvents).toHaveLength(2)
    expect(auditEvents[1]?.payload).toMatchObject({
      isCacheHit: true,
      costUsd: 0,
      rawOutput: unsafeVerdict,
    })
  })

  test('writes an event with the error when the call throws', async () => {
    const { llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [{ kind: 'http-error', statusCode: 400 }],
      },
    })

    await llmClient.generate(sampleGenerateOptions).catch(() => null)

    // one failed event that still parses against the contract
    expect(auditEvents).toHaveLength(1)
    const llmCallEvent = auditEventSchema.parse(auditEvents[0])
    expect(llmCallEvent.payload).toMatchObject({
      status: 'failed',
      promptId: 'code-review',
      usage: null,
      costUsd: null,
      isCacheHit: false,
    })
    expect(String(llmCallEvent.payload.error)).toContain('400')
  })

  test('writes the raw output and usage of a validation failure', async () => {
    const { llmClient } = createTestClient({
      repliesByPromptId: {
        'code-review': [
          { kind: 'output', output: invalidVerdict, usage: sampleUsage },
        ],
      },
    })

    await llmClient.generate(sampleGenerateOptions).catch(() => null)

    expect(auditEvents[0]?.payload).toMatchObject({
      status: 'failed',
      rawOutput: invalidVerdict,
      usage: { inputTokens: 2000, outputTokens: 1000 },
    })
  })
})
