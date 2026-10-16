// tests for the benchmark contract: a snapshot case, a git case and a score round-trip, and a source mixing both shapes is rejected
import { describe, expect, test } from 'bun:test'
import {
  type BenchmarkCase,
  type BenchmarkScore,
  benchmarkCaseSchema,
  benchmarkScoreSchema,
} from './benchmark'

// a checked-in case with a vulnerable dependency
const snapshotCaseSample: BenchmarkCase = {
  id: 'dependency-lodash-template',
  split: 'dev',
  category: 'dependency',
  isClean: false,
  description: 'Adds lodash 4.17.20, which has a known command injection.',
  source: {
    kind: 'snapshot',
    directory: 'benchmark/cases/dependency-lodash-template',
  },
  expected: [
    {
      detector: 'dependency',
      packageName: 'lodash',
      advisoryId: 'GHSA-35jh-r3h4-6jhm',
      severity: 'high',
    },
  ],
}

// a real-world case fetched from github at two revisions
const gitCaseSample: BenchmarkCase = {
  id: 'real-world-hello-world-42',
  split: 'test',
  category: 'real-world',
  isClean: false,
  description: 'Pull request 42 of octocat/hello-world.',
  source: {
    kind: 'git',
    repositoryUrl: 'https://github.com/octocat/hello-world',
    baseSha: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    headSha: '76543210f9e8d7c6b5a4938271605f4e3d2c1b0a',
  },
  expected: [
    {
      detector: 'code-review',
      vulnerabilityType: 'CWE-89',
      file: 'src/users.ts',
      startLine: 42,
      endLine: 44,
    },
  ],
}

// the score of a run over both cases
const benchmarkScoreSample: BenchmarkScore = {
  precision: 0.75,
  recall: 1,
  f1: 0.857,
  byDetector: {
    dependency: { precision: 1, recall: 1, f1: 1 },
    'code-review': { precision: 0.5, recall: 1, f1: 0.667 },
  },
  byCategory: {
    dependency: { precision: 1, recall: 1, f1: 1 },
    'real-world': { precision: 0.5, recall: 1, f1: 0.667 },
  },
  falsePositivesOnClean: 0,
  totalCostUsd: 0.24,
  totalDurationMs: 123456,
  caseResults: [
    {
      caseId: 'dependency-lodash-template',
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
    },
    {
      caseId: 'real-world-hello-world-42',
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
    },
  ],
}

describe('benchmarkCaseSchema', () => {
  test('a snapshot case round-trips', () => {
    // parse the case and read its source variant back
    const parsedSnapshotCase = benchmarkCaseSchema.parse(snapshotCaseSample)
    expect(parsedSnapshotCase).toEqual(snapshotCaseSample)
    expect(parsedSnapshotCase.source.kind).toBe('snapshot')
  })

  test('a git case round-trips', () => {
    // parse the case and read its source variant back
    const parsedGitCase = benchmarkCaseSchema.parse(gitCaseSample)
    expect(parsedGitCase).toEqual(gitCaseSample)
    expect(parsedGitCase.source.kind).toBe('git')
  })

  test('a source mixing both shapes is rejected', () => {
    // put the git fields on a snapshot source
    const mixedSourceCase = {
      ...snapshotCaseSample,
      source: {
        ...snapshotCaseSample.source,
        ...gitCaseSample.source,
        kind: 'snapshot',
      },
    }
    expect(() => benchmarkCaseSchema.parse(mixedSourceCase)).toThrow(
      /repositoryUrl/,
    )
  })
})

describe('benchmarkScoreSchema', () => {
  test('a score round-trips', () => {
    expect(benchmarkScoreSchema.parse(benchmarkScoreSample)).toEqual(
      benchmarkScoreSample,
    )
  })
})
