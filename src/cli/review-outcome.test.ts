// tests the review exit status and the fail-on check and the one-line summary
import { describe, expect, test } from 'bun:test'
import {
  codeReviewFindingSample,
  dependencyFindingSample,
  secretFindingSample,
} from '@/shared/finding.samples'
import type { ReviewResult } from '@/shared/review'
import {
  decideReviewExitCode,
  formatReviewSummary,
  hasFindingAtOrAbove,
} from './review-outcome'

// a review result with the given findings and errors
function createReviewResult(fields: Partial<ReviewResult>): ReviewResult {
  return {
    metadata: {
      runId: 'test-run',
      startedAt: '2026-10-15T12:00:00.000Z',
      finishedAt: '2026-10-15T12:00:01.000Z',
      baseSha: 'base',
      headSha: 'head',
      stepDurations: {},
      totalCostUsd: 0,
      promptVersions: {},
      modelIds: {},
      groundingRejectionCount: 0,
      suspectedPromptInjectionCount: 0,
      degradedSteps: ['code-review: placeholder'],
    },
    findings: [],
    errors: [],
    ...fields,
  }
}

// an introduced critical finding and a pre-existing one
const introducedCriticalFinding = {
  ...secretFindingSample,
  severity: 'critical' as const,
  isIntroducedByPullRequest: true,
}
const preExistingCriticalFinding = {
  ...codeReviewFindingSample,
  severity: 'critical' as const,
  isIntroducedByPullRequest: false,
}

describe('hasFindingAtOrAbove', () => {
  test('counts introduced findings at or above the severity only', () => {
    expect(
      hasFindingAtOrAbove({
        findings: [introducedCriticalFinding],
        failOnSeverity: 'high',
      }),
    ).toBe(true)
    expect(
      hasFindingAtOrAbove({
        findings: [preExistingCriticalFinding],
        failOnSeverity: 'low',
      }),
    ).toBe(false)
    expect(
      hasFindingAtOrAbove({
        findings: [{ ...introducedCriticalFinding, severity: 'medium' }],
        failOnSeverity: 'high',
      }),
    ).toBe(false)
  })
})

describe('decideReviewExitCode', () => {
  test('exits 1 when fail-on is met and 0 when it is not set or not met', () => {
    const reviewResult = createReviewResult({
      findings: [introducedCriticalFinding, preExistingCriticalFinding],
    })

    expect(decideReviewExitCode(reviewResult, 'critical')).toBe(1)
    expect(decideReviewExitCode(reviewResult, undefined)).toBe(0)
    expect(
      decideReviewExitCode(
        createReviewResult({ findings: [preExistingCriticalFinding] }),
        'low',
      ),
    ).toBe(0)
  })

  test('exits 2 on an aborted run whatever it found', () => {
    const abortedResult = createReviewResult({
      errors: [
        { step: 'describe-pull-request', message: 'gone', isFatal: true },
      ],
    })

    expect(decideReviewExitCode(abortedResult, 'low')).toBe(2)
    expect(decideReviewExitCode(abortedResult, undefined)).toBe(2)
  })
})

describe('formatReviewSummary', () => {
  test('counts introduced findings by severity, pre-existing findings, errors and degraded steps', () => {
    const reviewResult = createReviewResult({
      findings: [
        introducedCriticalFinding,
        {
          ...dependencyFindingSample,
          severity: 'high',
          isIntroducedByPullRequest: true,
        },
        preExistingCriticalFinding,
      ],
    })

    expect(formatReviewSummary(reviewResult)).toBe(
      '2 introduced (1 critical, 1 high), 1 pre-existing, 0 errors, 1 degraded steps',
    )
  })
})
