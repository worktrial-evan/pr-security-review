// tests the review config reader and the overrides. also tests the api key check
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findMissingApiKeys } from './api-keys'
import { testReviewOptions } from './pipeline-fixtures'
import { loadReviewSettings, readReviewConfig } from './review-settings'

// a directory for config files written by a test
let configDirectory: string

beforeEach(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-config-'))
})

afterEach(async () => {
  await rm(configDirectory, { recursive: true, force: true })
})

describe('readReviewConfig', () => {
  test('reads the eight checked-in keys with their values', async () => {
    expect(await readReviewConfig()).toEqual({
      contextLines: 30,
      isLlmEnabled: true,
      isCacheEnabled: true,
      advisoryStaleHours: 24,
      reviewPromptVersion: '1',
      maxChangedFiles: 200,
      maxFileBytes: 1_000_000,
      maxReviewCostUsd: 2,
    })
  })

  test('rejects a config with an unknown key', async () => {
    const configPath = join(configDirectory, 'review.json')
    const shippedConfig = await readReviewConfig()
    await Bun.write(
      configPath,
      JSON.stringify({ ...shippedConfig, maxTokens: 9 }),
    )

    await expect(readReviewConfig(configPath)).rejects.toThrow('is invalid')
  })
})

describe('loadReviewSettings', () => {
  test('uses the configured defaults without overrides', async () => {
    const reviewSettings = await loadReviewSettings()

    expect(reviewSettings.reviewOptions.isLlmEnabled).toBe(true)
    expect(reviewSettings.reviewOptions.isOffline).toBe(false)
    expect(reviewSettings.reviewOptions.contextLines).toBe(30)
    expect(reviewSettings.reviewOptions.reviewModelId).toBe(
      'anthropic/claude-sonnet-5-5',
    )
    expect(reviewSettings.reviewPromptVersion).toBe('1')
    expect(reviewSettings.limits).toEqual({
      maxChangedFiles: 200,
      maxFileBytes: 1_000_000,
      maxReviewCostUsd: 2,
    })
  })

  test('applies every override for one run', async () => {
    const reviewSettings = await loadReviewSettings({
      overrides: {
        isLlmEnabled: false,
        isCacheEnabled: false,
        isOffline: true,
        reviewModelId: 'fireworks/review-model',
        summarizeModelId: 'fireworks/summarize-model',
        reviewPromptVersion: '3',
        failOnSeverity: 'high',
      },
    })

    expect(reviewSettings.reviewOptions).toMatchObject({
      isLlmEnabled: false,
      isCacheEnabled: false,
      isOffline: true,
      reviewModelId: 'fireworks/review-model',
      summarizeModelId: 'fireworks/summarize-model',
      failOnSeverity: 'high',
    })
    expect(reviewSettings.reviewPromptVersion).toBe('3')
  })
})

describe('findMissingApiKeys', () => {
  test('names the key of each provider that is unset or empty', () => {
    const missingApiKeys = findMissingApiKeys({
      reviewOptions: {
        ...testReviewOptions,
        reviewModelId: 'anthropic/review-model',
        summarizeModelId: 'fireworks/summarize-model',
      },
      environment: { ANTHROPIC_API_KEY: '' },
    })

    expect(missingApiKeys).toEqual(['ANTHROPIC_API_KEY', 'FIREWORKS_API_KEY'])
  })

  test('needs nothing when the keys are set or the llm is off', () => {
    expect(
      findMissingApiKeys({
        reviewOptions: testReviewOptions,
        environment: { ANTHROPIC_API_KEY: 'set' },
      }),
    ).toEqual([])
    expect(
      findMissingApiKeys({
        reviewOptions: { ...testReviewOptions, isLlmEnabled: false },
        environment: {},
      }),
    ).toEqual([])
  })
})
