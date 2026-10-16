// tests for the results file schema: a run over one case round-trips and a case status outside the enum is rejected
import { expect, test } from 'bun:test'
import { codeReviewFindingSample } from '@/shared/finding.samples'
import {
  type BenchmarkRunResults,
  benchmarkRunResultsSchema,
} from './run-results'
import { scoreBenchmark } from './score'

// the results of a run over one code case the stub matched exactly
const sampleResults: BenchmarkRunResults = (() => {
  const score = scoreBenchmark({
    caseOutcomes: [
      {
        benchmarkCase: {
          id: 'code-01-sql',
          split: 'dev',
          category: 'code',
          isClean: false,
          description: 'the sample case',
          source: {
            kind: 'snapshot',
            directory: 'benchmark/cases/code-01-sql',
          },
          expected: [{ detector: 'code-review', vulnerabilityType: 'CWE-89' }],
        },
        findings: [codeReviewFindingSample],
        costUsd: 0.01,
        durationMs: 20,
        status: 'completed',
      },
    ],
  })
  return {
    label: 'sample',
    split: 'dev',
    startedAt: '2026-10-15T20:15:00.000Z',
    finishedAt: '2026-10-15T20:15:01.000Z',
    gitSha: '0123456789abcdef0123456789abcdef01234567',
    promptVersions: { 'code-review': 'v3' },
    modelIds: { 'code-review': 'fake-review-model' },
    advisorySnapshotDate: '2026-10-01T00:00:00.000Z',
    isLlmCacheUsed: true,
    score,
    cases: score.caseDetails,
    warnings: [],
  }
})()

test('a results object round-trips through the schema', () => {
  expect(benchmarkRunResultsSchema.parse(sampleResults)).toEqual(sampleResults)
})

test('a case status outside the enum is rejected', () => {
  // the same results with one case in an unknown status
  const brokenResults = {
    ...sampleResults,
    cases: [{ ...sampleResults.cases[0], status: 'running' }],
  }
  expect(benchmarkRunResultsSchema.safeParse(brokenResults).success).toBe(false)
})
