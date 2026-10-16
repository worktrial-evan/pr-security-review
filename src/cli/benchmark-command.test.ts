// tests benchmark show over missing and valid and broken results. also tests the per-case pipeline, a review against the corpus advisories and a cancelled run
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BenchmarkRunResults } from '@/benchmark/run-results'
import {
  makeSnapshotCase,
  snapshotFilesWithChange,
  writeCase,
} from '@/benchmark/temporary-corpus'
import { isOracleAvailable } from '@/matcher/oracle'
import { createLockfileMatcher, type RunOracle } from '@/pipeline/matching-step'
import {
  createMemoryAuditSink,
  testReviewOptions,
  testRunSettings,
} from '@/pipeline/pipeline-fixtures'
import { runReview } from '@/pipeline/run-review'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import type { PullRequestSource } from '@/shared/pull-request-source'
import {
  createBenchmarkPipeline,
  formatMetricsLine,
  type RunBenchmarkCommandOptions,
  runBenchmarkCommand,
  runBenchmarkShowCommand,
  writeCorpusAdvisoryCache,
} from './benchmark-command'
import type { CliOutput } from './terminal-text'

// the temporary directory of the current test
let temporaryDirectory: string

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-benchmark-cli-'),
  )
})

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true })
})

// an output that keeps what is written to each stream
function createRecordingOutput(): CliOutput & {
  standardOutput: () => string
  standardError: () => string
} {
  let standardOutput = ''
  let standardError = ''
  return {
    writeOut: (text) => {
      standardOutput += text
    },
    writeErr: (text) => {
      standardError += text
    },
    standardOutput: () => standardOutput,
    standardError: () => standardError,
  }
}

// a results file for the dev split with an empty score
const devResults: BenchmarkRunResults = {
  label: 'baseline',
  split: 'dev',
  startedAt: '2026-10-15T12:00:00.000Z',
  finishedAt: '2026-10-15T12:05:00.000Z',
  gitSha: 'abc',
  promptVersions: {},
  modelIds: {},
  advisorySnapshotDate: '2026-10-15T00:00:00.000Z',
  isLlmCacheUsed: true,
  score: {
    precision: 0.5,
    recall: 0.25,
    f1: 1 / 3,
    byDetector: {},
    byCategory: {},
    falsePositivesOnClean: 1,
    totalCostUsd: 0.1234,
    totalDurationMs: 1000,
    caseResults: [],
    caseDetails: [],
  },
  cases: [],
  warnings: [],
}

describe('runBenchmarkShowCommand', () => {
  test('prints the latest metrics of a split and says when a split has none', async () => {
    await Bun.write(
      join(temporaryDirectory, 'latest-dev.json'),
      JSON.stringify(devResults),
    )
    const output = createRecordingOutput()
    const exitCode = await runBenchmarkShowCommand({
      output,
      resultsDirectory: temporaryDirectory,
    })

    expect(exitCode).toBe(0)
    expect(output.standardOutput()).toBe(
      `${formatMetricsLine(devResults)}\ntest: no results yet\n`,
    )
    expect(formatMetricsLine(devResults)).toContain(
      'dev baseline, f1 0.333, precision 0.500, recall 0.250',
    )
  })

  test('exits 1 on a results file that does not parse', async () => {
    await Bun.write(
      join(temporaryDirectory, 'latest-test.json'),
      '{"label": 1}',
    )
    const output = createRecordingOutput()
    const exitCode = await runBenchmarkShowCommand({
      output,
      resultsDirectory: temporaryDirectory,
    })

    expect(exitCode).toBe(1)
    expect(output.standardError()).toContain(
      'test: latest results do not parse',
    )
  })
})

describe('createBenchmarkPipeline', () => {
  test('writes an audit log per case and throws on an aborted run', async () => {
    // a source that cannot describe its pull request
    const brokenSource = {
      describe: async () => {
        throw new Error('repository is gone')
      },
    } as unknown as PullRequestSource
    const runsDirectory = join(temporaryDirectory, 'runs')
    const benchmarkPipeline = createBenchmarkPipeline({
      runSettings: testRunSettings,
      runsDirectory,
    })

    // the case fails and still leaves its audit log
    const pipelineRun = benchmarkPipeline({
      pullRequestSource: brokenSource,
      reviewOptions: { ...testReviewOptions, isLlmEnabled: false },
      auditSink: { write: async () => {} },
    })
    await expect(pipelineRun).rejects.toThrow(
      'describe-pull-request: repository is gone',
    )
    expect(await readdir(runsDirectory)).toHaveLength(1)
  })
})

// the committed benchmark case that downgrades ms to a version an advisory covers
const dependencyCaseDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'benchmark',
  'cases',
  'dependency-01-direct-production-vulnerable',
)

// an oracle that could not run
const runUnavailableOracle: RunOracle = async () => ({
  status: 'unavailable',
  reason: 'osv-scanner is not on PATH',
})

describe('the pipeline over the corpus advisory cache', () => {
  // review the dependency case with the llm off against the corpus advisories and the given oracle
  async function reviewDependencyCase(runOracle: RunOracle | undefined) {
    const advisoryCacheDirectory = join(temporaryDirectory, 'advisories')
    await writeCorpusAdvisoryCache(advisoryCacheDirectory)
    const auditSink = createMemoryAuditSink()
    const reviewResult = await runReview({
      pullRequestSource: new SnapshotPullRequestSource({
        baseDirectory: join(dependencyCaseDirectory, 'base'),
        headDirectory: join(dependencyCaseDirectory, 'head'),
      }),
      reviewOptions: {
        ...testReviewOptions,
        isLlmEnabled: false,
        advisoryCacheDirectory,
      },
      auditSink,
      runSettings: testRunSettings,
      detectors: { matchDependencies: createLockfileMatcher({ runOracle }) },
    })
    return { reviewResult, auditSink }
  }

  test('reports the downgraded package once across both lockfiles', async () => {
    const { reviewResult, auditSink } =
      await reviewDependencyCase(runUnavailableOracle)

    // one introduced finding for ms. the second lockfile's copy is dropped
    const introducedDependencyFindings = reviewResult.findings.filter(
      (finding) =>
        finding.detector === 'dependency' && finding.isIntroducedByPullRequest,
    )
    expect(introducedDependencyFindings).toHaveLength(1)
    expect(introducedDependencyFindings[0]).toMatchObject({
      packageName: 'ms',
      version: '1.0.0',
      advisoryId: 'GHSA-w9mr-4mfr-499f',
      matcherAgreement: 'oracle-unavailable',
      summarySource: 'template',
    })
    const droppedReasons = auditSink.events
      .filter((event) => event.step === 'dedupe-findings')
      .map((event) => event.payload.reason)
    expect(droppedReasons).toContain('same-dependency-in-another-lockfile')

    // the missing oracle degrades the step once per lockfile
    const matchingReasons = reviewResult.metadata.degradedSteps.filter(
      (degradedStep) => degradedStep.startsWith('match-dependencies:'),
    )
    expect(matchingReasons).toHaveLength(2)
    expect(matchingReasons[0]).toContain('osv-scanner is not on PATH')
  })

  test.skipIf(!isOracleAvailable())(
    'agrees with osv-scanner when it is installed',
    async () => {
      const { reviewResult } = await reviewDependencyCase(undefined)

      const msFinding = reviewResult.findings.find(
        (finding) =>
          finding.detector === 'dependency' &&
          finding.packageName === 'ms' &&
          finding.version === '1.0.0',
      )
      expect(msFinding).toMatchObject({ matcherAgreement: 'both' })
      expect(
        reviewResult.metadata.degradedSteps.filter((degradedStep) =>
          degradedStep.startsWith('match-dependencies:'),
        ),
      ).toEqual([])
    },
  )
})

describe('runBenchmarkCommand cancellation', () => {
  test('cancels the running case on SIGTERM, exits 143 and writes no results file', async () => {
    // a one-case corpus whose head changes one source line. every output of the run lands in the temporary directory
    const casesDirectory = join(temporaryDirectory, 'cases')
    const resultsDirectory = join(temporaryDirectory, 'results')
    const runsDirectory = join(temporaryDirectory, 'runs')
    await writeCase({
      casesDirectory,
      directoryName: 'code-01-cancelled',
      benchmarkCase: makeSnapshotCase({
        id: 'code-01-cancelled',
        split: 'dev',
      }),
      files: snapshotFilesWithChange(),
    })

    // a model provider that sends SIGTERM from its first call and answers with no findings
    const signalSource = new EventEmitter()
    const llmProvider: NonNullable<RunBenchmarkCommandOptions['llmProvider']> =
      {
        async generate() {
          signalSource.emit('SIGTERM')
          return {
            rawOutput: { findings: [], injectionAttempts: [] },
            usage: { inputTokens: 0, outputTokens: 0 },
          }
        },
      }

    // run the dev split with the llm on and a recording exit
    const exitCodes: number[] = []
    const output = createRecordingOutput()
    const exitCode = await runBenchmarkCommand({
      commandOptions: {
        split: 'dev',
        label: 'cancelled',
        isLlmEnabled: true,
        isCacheEnabled: false,
        reviewPromptVersion: undefined,
      },
      environment: { ANTHROPIC_API_KEY: 'not-a-real-key' },
      output,
      casesDirectory,
      resultsDirectory,
      runsDirectory,
      llmProvider,
      signalSource,
      exit: (code) => {
        exitCodes.push(code)
      },
    })

    // the command and the exit both carry 143 and no metrics line was printed
    expect(exitCode).toBe(143)
    expect(exitCodes).toEqual([143])
    expect(output.standardOutput()).toBe('')
    expect(signalSource.listenerCount('SIGTERM')).toBe(0)

    // no results file exists and the case's log ends with the cancelled note
    expect(existsSync(resultsDirectory)).toBe(false)
    const runIds = await readdir(runsDirectory)
    expect(runIds).toHaveLength(1)
    const auditText = await Bun.file(
      join(runsDirectory, runIds[0] ?? '', 'audit.jsonl'),
    ).text()
    const auditLines = auditText.trim().split('\n')
    expect(JSON.parse(auditLines.at(-1) ?? '')).toMatchObject({
      kind: 'note',
      step: 'run',
      payload: {
        message: 'run cancelled',
        status: 'cancelled',
        signal: 'SIGTERM',
        stage: 'code-review',
      },
    })
  })
})
