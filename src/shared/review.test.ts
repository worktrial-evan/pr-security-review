// tests for the review contract: the options round-trip and a result with one finding per detector and one step error round-trips
import { describe, expect, test } from 'bun:test'
import {
  codeReviewFindingSample,
  scaFindingSample,
  secretFindingSample,
} from './finding.samples'
import {
  type ReviewOptions,
  type ReviewResult,
  reviewOptionsSchema,
  reviewResultSchema,
} from './review'

// the defaults a review runs with
const reviewOptionsSample: ReviewOptions = {
  isLlmEnabled: true,
  isCacheEnabled: true,
  isOffline: false,
  advisoryCacheDir: 'cache/advisories',
  reviewModelId: 'claude-sonnet-4-5',
  summarizeModelId: 'claude-haiku-4-5',
  contextLines: 30,
  failOnSeverity: 'high',
}

// a finished review with one finding per detector and a degraded summarize step
const reviewResultSample: ReviewResult = {
  metadata: {
    runId: 'run-20261015-083000',
    startedAt: '2026-10-15T08:30:00.000Z',
    finishedAt: '2026-10-15T08:31:12.000Z',
    pullRequestReference: {
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
      url: 'https://github.com/octocat/hello-world/pull/42',
    },
    baseSha: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    headSha: '76543210f9e8d7c6b5a4938271605f4e3d2c1b0a',
    stepDurations: {
      'resolving-pull-request': 410,
      matching: 1200,
      'code-review': 60000,
      summarizing: 500,
    },
    totalCostUsd: 0.12,
    advisorySnapshot: {
      fetchedAt: '2026-10-15T08:00:00.000Z',
      sourceUrl:
        'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip',
      entryCount: 12345,
      sha256:
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    },
    promptVersions: { 'code-review': '1', summarize: '1' },
    modelIds: {
      'code-review': 'claude-sonnet-4-5',
      summarize: 'claude-haiku-4-5',
    },
    groundingRejectionCount: 1,
    suspectedPromptInjectionCount: 0,
    degradedSteps: ['summarizing'],
  },
  findings: [scaFindingSample, codeReviewFindingSample, secretFindingSample],
  errors: [
    {
      step: 'summarizing',
      message: 'model timed out, fell back to the template summary',
      isFatal: false,
    },
  ],
}

describe('reviewOptionsSchema', () => {
  test('the options round-trip', () => {
    expect(reviewOptionsSchema.parse(reviewOptionsSample)).toEqual(
      reviewOptionsSample,
    )
  })
})

describe('reviewResultSchema', () => {
  test('a result with one finding per detector and one step error round-trips', () => {
    // parse the result and read the detector of each finding back
    const parsedReviewResult = reviewResultSchema.parse(reviewResultSample)
    expect(parsedReviewResult).toEqual(reviewResultSample)
    expect(
      parsedReviewResult.findings.map((finding) => finding.detector),
    ).toEqual(['sca', 'code-review', 'secrets'])
  })
})
