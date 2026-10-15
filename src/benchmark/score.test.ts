// tests for the benchmark scorer: one-to-one matching, the pre-existing exclusion, the per-case counts, the corpus metrics and the breakdowns
import { describe, expect, test } from 'bun:test'
import type {
  BenchmarkCase,
  BenchmarkCategory,
  ExpectedFinding,
} from '@/shared/benchmark'
import type { Finding } from '@/shared/finding'
import {
  codeReviewFindingSample,
  scaFindingSample,
  secretFindingSample,
} from '@/shared/finding.samples'
import {
  type BenchmarkCaseOutcome,
  type BenchmarkCaseStatus,
  scoreBenchmark,
} from './score'

// the fields a test case overrides on top of a plain dev case
interface MakeBenchmarkCaseOptions {
  id: string
  category: BenchmarkCategory
  expected: ExpectedFinding[]
  isClean?: boolean
}

// build a snapshot case with the given labels
function makeBenchmarkCase({
  id,
  category,
  expected,
  isClean = false,
}: MakeBenchmarkCaseOptions): BenchmarkCase {
  return {
    id,
    split: 'dev',
    category,
    isClean,
    description: `the ${id} case`,
    source: { kind: 'snapshot', dir: `benchmark/cases/${id}` },
    expected,
  }
}

// the fields a test outcome overrides on top of a completed free case
interface MakeOutcomeOptions {
  benchmarkCase: BenchmarkCase
  findings: Finding[]
  status?: BenchmarkCaseStatus
  costUsd?: number
  durationMs?: number
  errorMessage?: string
}

// build an outcome the runner would hand the scorer
function makeOutcome({
  benchmarkCase,
  findings,
  status = 'completed',
  costUsd = 0,
  durationMs = 0,
  errorMessage,
}: MakeOutcomeOptions): BenchmarkCaseOutcome {
  return { benchmarkCase, findings, status, costUsd, durationMs, errorMessage }
}

// the sample secret finding is pre-existing, so the secret tests use an introduced copy
const introducedSecretFinding: Finding = {
  ...secretFindingSample,
  isIntroducedByPullRequest: true,
}

// the labels that match each sample finding exactly
const expectedScaFinding: ExpectedFinding = {
  detector: 'sca',
  packageName: 'lodash',
  advisoryId: 'GHSA-35jh-r3h4-6jhm',
}
const expectedCodeReviewFinding: ExpectedFinding = {
  detector: 'code-review',
  cwe: 'CWE-89',
  file: 'src/users.ts',
  startLine: 42,
  endLine: 44,
}
const expectedSecretFinding: ExpectedFinding = {
  detector: 'secrets',
  file: 'config/deploy.yml',
  startLine: 7,
}

describe('one-to-one matching', () => {
  test('duplicate predictions', () => {
    // two predictions both satisfy the one expected finding
    const benchmarkCase = makeBenchmarkCase({
      id: 'code-01-sql',
      category: 'code',
      expected: [expectedCodeReviewFinding],
    })
    const duplicatePrediction: Finding = {
      ...codeReviewFindingSample,
      startLine: 43,
      endLine: 43,
    }
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({
          benchmarkCase,
          findings: [codeReviewFindingSample, duplicatePrediction],
        }),
      ],
    })
    expect(runScore.caseResults[0]).toEqual({
      caseId: 'code-01-sql',
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
    })
    expect(runScore.caseDetails[0]?.matchedPairs[0]?.predictedFinding).toBe(
      codeReviewFindingSample,
    )
  })

  test('two labels competing for one prediction', () => {
    // the first label in order takes the prediction and the second is missed
    const secondLabel: ExpectedFinding = {
      ...expectedCodeReviewFinding,
      startLine: 45,
      endLine: 45,
    }
    const benchmarkCase = makeBenchmarkCase({
      id: 'code-02-two-labels',
      category: 'code',
      expected: [expectedCodeReviewFinding, secondLabel],
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({ benchmarkCase, findings: [codeReviewFindingSample] }),
      ],
    })
    expect(runScore.caseResults[0]).toEqual({
      caseId: 'code-02-two-labels',
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 1,
    })
    expect(runScore.caseDetails[0]?.matchedPairs[0]?.expectedFinding).toBe(
      expectedCodeReviewFinding,
    )
    expect(runScore.caseDetails[0]?.missedExpectations).toEqual([secondLabel])
  })
})

describe('pre-existing exclusion', () => {
  test('pre-existing finding is excluded', () => {
    // a clean case receiving one finding the pull request did not introduce
    const benchmarkCase = makeBenchmarkCase({
      id: 'clean-01-config',
      category: 'clean',
      expected: [],
      isClean: true,
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({ benchmarkCase, findings: [secretFindingSample] }),
      ],
    })
    expect(runScore.caseDetails[0]?.falsePositives).toBe(0)
    expect(runScore.caseDetails[0]?.preExistingFindings).toEqual([
      secretFindingSample,
    ])
    expect(runScore.falsePositivesOnClean).toBe(0)
  })
})

describe('per-case counts', () => {
  test('clean case with a prediction', () => {
    // a clean case receiving one introduced finding
    const benchmarkCase = makeBenchmarkCase({
      id: 'clean-02-refactor',
      category: 'clean',
      expected: [],
      isClean: true,
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({ benchmarkCase, findings: [codeReviewFindingSample] }),
      ],
    })
    expect(runScore.caseResults[0]).toEqual({
      caseId: 'clean-02-refactor',
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: 0,
    })
    expect(runScore.falsePositivesOnClean).toBe(1)
  })

  test('missed finding', () => {
    // a case expecting one finding and receiving none
    const benchmarkCase = makeBenchmarkCase({
      id: 'secrets-01-token',
      category: 'secrets',
      expected: [expectedSecretFinding],
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [makeOutcome({ benchmarkCase, findings: [] })],
    })
    expect(runScore.caseResults[0]?.falseNegatives).toBe(1)
    expect(runScore.caseDetails[0]?.missedExpectations).toEqual([
      expectedSecretFinding,
    ])
  })

  test('failed case misses everything, scores no prediction and keeps the pre-existing findings', () => {
    // a failed case whose pipeline still returned a matching finding and a pre-existing one
    const benchmarkCase = makeBenchmarkCase({
      id: 'sca-01-lodash',
      category: 'sca',
      expected: [expectedScaFinding],
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({
          benchmarkCase,
          findings: [scaFindingSample, secretFindingSample],
          status: 'failed',
          errorMessage: 'pipeline threw',
        }),
      ],
    })
    expect(runScore.caseResults[0]).toEqual({
      caseId: 'sca-01-lodash',
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 1,
    })
    expect(runScore.caseDetails[0]?.status).toBe('failed')
    expect(runScore.caseDetails[0]?.errorMessage).toBe('pipeline threw')
    expect(runScore.caseDetails[0]?.preExistingFindings).toEqual([
      secretFindingSample,
    ])
  })

  test('skipped case counts nothing and is left out of the totals', () => {
    // a skipped case with a label, a cost and a duration
    const skippedCase = makeBenchmarkCase({
      id: 'real-world-01-fix',
      category: 'real-world',
      expected: [expectedCodeReviewFinding],
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({
          benchmarkCase: skippedCase,
          findings: [],
          status: 'skipped',
          costUsd: 3,
          durationMs: 400,
        }),
      ],
    })
    expect(runScore.caseResults[0]?.falseNegatives).toBe(0)
    expect(runScore.byCategory).toEqual({})
    expect(runScore.byDetector).toEqual({})
    expect(runScore.totalCostUsd).toBe(0)
    expect(runScore.totalDurationMs).toBe(0)
  })
})

describe('corpus metrics', () => {
  test('micro average', () => {
    // one case with 2 true positives and 1 false positive, one with 1 false positive and 1 false negative
    const firstCase = makeBenchmarkCase({
      id: 'code-01-two-hits',
      category: 'code',
      expected: [
        expectedCodeReviewFinding,
        { detector: 'code-review', cwe: 'CWE-79' },
      ],
    })
    const crossSiteScriptingFinding: Finding = {
      ...codeReviewFindingSample,
      cwe: 'CWE-79',
    }
    const strayFinding: Finding = {
      ...codeReviewFindingSample,
      cwe: 'CWE-22',
    }
    const secondCase = makeBenchmarkCase({
      id: 'secrets-01-missed',
      category: 'secrets',
      expected: [expectedSecretFinding],
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({
          benchmarkCase: firstCase,
          findings: [
            codeReviewFindingSample,
            crossSiteScriptingFinding,
            strayFinding,
          ],
          costUsd: 0.25,
          durationMs: 100,
        }),
        makeOutcome({
          benchmarkCase: secondCase,
          findings: [strayFinding],
          costUsd: 0.5,
          durationMs: 200,
        }),
      ],
    })
    expect(runScore.precision).toBeCloseTo(2 / 4)
    expect(runScore.recall).toBeCloseTo(2 / 3)
    expect(runScore.f1).toBeCloseTo((2 * (2 / 4) * (2 / 3)) / (2 / 4 + 2 / 3))
    expect(runScore.totalCostUsd).toBeCloseTo(0.75)
    expect(runScore.totalDurationMs).toBe(300)
  })

  test('zero division', () => {
    // a clean case with no labels and no predictions
    const benchmarkCase = makeBenchmarkCase({
      id: 'clean-03-empty',
      category: 'clean',
      expected: [],
      isClean: true,
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [makeOutcome({ benchmarkCase, findings: [] })],
    })
    expect(runScore.precision).toBe(0)
    expect(runScore.recall).toBe(0)
    expect(runScore.f1).toBe(0)
    expect(runScore.byCategory.clean).toEqual({
      precision: 0,
      recall: 0,
      f1: 0,
    })
  })

  test('breakdown keys', () => {
    // an sca case and a clean case, with predictions of the sca and secrets detectors
    const scaCase = makeBenchmarkCase({
      id: 'sca-02-lodash',
      category: 'sca',
      expected: [expectedScaFinding],
    })
    const cleanCase = makeBenchmarkCase({
      id: 'clean-04-secret-shaped',
      category: 'clean',
      expected: [],
      isClean: true,
    })
    const runScore = scoreBenchmark({
      caseOutcomes: [
        makeOutcome({ benchmarkCase: scaCase, findings: [scaFindingSample] }),
        makeOutcome({
          benchmarkCase: cleanCase,
          findings: [introducedSecretFinding],
        }),
      ],
    })
    expect(Object.keys(runScore.byCategory).sort()).toEqual(['clean', 'sca'])
    expect(Object.keys(runScore.byDetector).sort()).toEqual(['sca', 'secrets'])
    expect(runScore.byDetector.sca).toEqual({ precision: 1, recall: 1, f1: 1 })
    expect(runScore.byDetector.secrets).toEqual({
      precision: 0,
      recall: 0,
      f1: 0,
    })
  })
})
