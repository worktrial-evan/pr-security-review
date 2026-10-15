// the fixture review result: 27 findings from all three detectors, one step error and full run metadata
import type { ReviewResult } from '@/shared/review'
import { codeReviewFixtureFindings } from './code-review-findings'
import { scaFixtureFindings } from './sca-findings'
import { secretFixtureFindings } from './secret-findings'

// a finished review of a pull request whose summarize step degraded to template text
export const fixtureReviewResult: ReviewResult = {
  metadata: {
    runId: 'run-20261014-093000',
    startedAt: '2026-10-14T09:30:00.000Z',
    finishedAt: '2026-10-14T09:34:12.000Z',
    pullRequestReference: {
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
      url: 'https://github.com/octocat/hello-world/pull/42',
    },
    baseSha: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    headSha: '76543210f9e8d7c6b5a4938271605f4e3d2c1b0a',
    stepDurations: {
      'parse-lockfile': 1200,
      'match-advisories': 4800,
      'scan-secrets': 900,
      'review-code': 181000,
      summarize: 64000,
    },
    totalCostUsd: 0.1834,
    advisorySnapshot: {
      fetchedAt: '2026-10-14T06:00:00.000Z',
      sourceUrl: 'https://osv-vulnerabilities.storage.googleapis.com/all.zip',
      entryCount: 214873,
      sha256:
        'a3f1c5e7b9d2046810fe3ca5b7d9e1f30246a8cef1b3d5079e2c4a6b8d0f1e23',
    },
    promptVersions: { 'code-review': '3', summarize: '2' },
    modelIds: {
      'code-review': 'claude-sonnet-4-5',
      summarize: 'claude-haiku-4-5',
    },
    groundingRejectionCount: 2,
    degradedSteps: ['summarize'],
  },
  findings: [
    ...scaFixtureFindings,
    ...codeReviewFixtureFindings,
    ...secretFixtureFindings,
  ],
  errors: [
    {
      step: 'summarize',
      message: 'The summary model timed out. Template summaries were used.',
      isFatal: false,
    },
  ],
}
