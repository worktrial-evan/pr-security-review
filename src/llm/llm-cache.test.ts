// tests for the llm cache: the key changes with each of its inputs, entries round-trip, and a bad entry is a miss
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type CreateLlmCacheKeyOptions,
  createLlmCacheKey,
  type LlmCacheEntry,
  readLlmCacheEntry,
  resolveLlmCacheFilePath,
  writeLlmCacheEntry,
} from './llm-cache'

// a request to key
const sampleCacheKeyOptions: CreateLlmCacheKeyOptions = {
  modelId: 'anthropic/claude-sonnet-5-5',
  promptHash: 'a'.repeat(64),
  system: 'You review code.',
  user: 'Review this diff.',
  outputJsonSchema: { type: 'object' },
}

// a cached response
const sampleCacheEntry: LlmCacheEntry = {
  modelId: 'anthropic/claude-sonnet-5-5',
  promptId: 'code-review',
  rawOutput: { findings: [] },
  usage: { inputTokens: 10, outputTokens: 5 },
  createdAt: '2026-10-15T12:00:00.000Z',
}

describe('createLlmCacheKey', () => {
  test('is a stable 64 character hex sha256', () => {
    const cacheKey = createLlmCacheKey(sampleCacheKeyOptions)

    expect(cacheKey).toMatch(/^[0-9a-f]{64}$/)
    expect(createLlmCacheKey({ ...sampleCacheKeyOptions })).toBe(cacheKey)
  })

  test('changes when any one input changes', () => {
    // one variant per keyed field
    const changedCacheKeyOptions: CreateLlmCacheKeyOptions[] = [
      { ...sampleCacheKeyOptions, modelId: 'anthropic/claude-haiku-5-5' },
      { ...sampleCacheKeyOptions, promptHash: 'b'.repeat(64) },
      { ...sampleCacheKeyOptions, system: 'You summarize.' },
      { ...sampleCacheKeyOptions, user: 'Review this other diff.' },
      { ...sampleCacheKeyOptions, outputJsonSchema: { type: 'array' } },
    ]

    // every variant gives a key of its own
    const cacheKeys = changedCacheKeyOptions.map(createLlmCacheKey)
    cacheKeys.push(createLlmCacheKey(sampleCacheKeyOptions))
    expect(new Set(cacheKeys).size).toBe(6)
  })
})

describe('readLlmCacheEntry and writeLlmCacheEntry', () => {
  // a fresh cache directory per test
  let cacheDirectory = ''
  beforeEach(async () => {
    cacheDirectory = await mkdtemp(join(tmpdir(), 'llm-cache-test-'))
  })
  afterEach(async () => {
    await rm(cacheDirectory, { recursive: true, force: true })
  })

  test('writes llm/<key>.json and reads it back', async () => {
    // write one entry
    const cacheKey = createLlmCacheKey(sampleCacheKeyOptions)
    await writeLlmCacheEntry({
      cacheDirectory,
      cacheKey,
      llmCacheEntry: sampleCacheEntry,
    })

    // the file sits under llm and reads back equal
    const llmCacheFilePath = resolveLlmCacheFilePath({
      cacheDirectory,
      cacheKey,
    })
    expect(llmCacheFilePath).toBe(
      join(cacheDirectory, 'llm', `${cacheKey}.json`),
    )
    expect(await readLlmCacheEntry({ cacheDirectory, cacheKey })).toEqual(
      sampleCacheEntry,
    )
  })

  test('reads a missing entry as a miss', async () => {
    expect(
      await readLlmCacheEntry({ cacheDirectory, cacheKey: 'f'.repeat(64) }),
    ).toBeNull()
  })

  test('reads an invalid entry as a miss', async () => {
    // write a file that is JSON but not an entry, and one that is not JSON
    const llmCacheDirectory = join(cacheDirectory, 'llm')
    await Bun.write(
      join(llmCacheDirectory, `${'1'.repeat(64)}.json`),
      '{"x":1}',
    )
    await Bun.write(
      join(llmCacheDirectory, `${'2'.repeat(64)}.json`),
      'not json',
    )

    expect(
      await readLlmCacheEntry({ cacheDirectory, cacheKey: '1'.repeat(64) }),
    ).toBeNull()
    expect(
      await readLlmCacheEntry({ cacheDirectory, cacheKey: '2'.repeat(64) }),
    ).toBeNull()
  })
})
