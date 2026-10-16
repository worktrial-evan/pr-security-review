// the benchmark commands. run the pipeline over one or both splits with a per-case audit log under the signal watch. show the latest metrics
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  indexAdvisoriesByPackage,
  writeAdvisoryCache,
} from '@/advisories/refresh-advisories'
import {
  benchmarkAdvisoryFixtureDirectory,
  resolveRepositoryRoot,
} from '@/benchmark/cases'
import { describeZodError } from '@/benchmark/error-messages'
import { readAdvisoryFixture } from '@/benchmark/fixtures'
import { runBenchmark } from '@/benchmark/run'
import {
  type BenchmarkRunResults,
  benchmarkRunResultsSchema,
} from '@/benchmark/run-results'
import { findMissingApiKeys } from '@/pipeline/api-keys'
import {
  loadReviewSettings,
  type ReviewSettings,
  type RunSettings,
} from '@/pipeline/review-settings'
import { openRunAuditLog } from '@/pipeline/run-audit-log'
import {
  createRunCancellation,
  type RunCancellation,
} from '@/pipeline/run-cancellation'
import { createRunId } from '@/pipeline/run-record'
import { type RunReviewOptions, runReview } from '@/pipeline/run-review'
import { advisorySnapshotSchema } from '@/shared/advisory'
import { type BenchmarkSplit, benchmarkSplits } from '@/shared/benchmark'
import type { PullRequestSource } from '@/shared/pull-request-source'
import type { ReviewPipeline } from '@/shared/review'
import type { BenchmarkRunCommandOptions } from './program'
import { runUntilSignal, type SignalSource } from './signal-cancellation'
import type { CliOutput } from './terminal-text'

// the directory every benchmark case run writes its audit log under unless a caller names another
const defaultBenchmarkRunsDirectory = 'runs'

// the parsed options and the environment to read keys and the token from. also where to write
// tests replace the corpus and results and runs directories and the model provider and the signal source and the exit
export interface RunBenchmarkCommandOptions {
  commandOptions: BenchmarkRunCommandOptions
  environment: Record<string, string | undefined>
  output: CliOutput
  casesDirectory?: string
  resultsDirectory?: string
  runsDirectory?: string
  llmProvider?: RunReviewOptions['llmProvider']
  signalSource?: SignalSource
  exit?: (exitCode: number) => void
}

/**
 * Runs the pipeline over the chosen splits, writes the results files and prints one metrics line per split. A signal cancels the running case, writes no results and exits with 128 plus the signal number.
 */
export async function runBenchmarkCommand({
  commandOptions,
  environment,
  output,
  casesDirectory,
  resultsDirectory,
  runsDirectory,
  llmProvider,
  signalSource,
  exit,
}: RunBenchmarkCommandOptions): Promise<number> {
  // build the settings and stop when a key is missing
  const reviewSettings = await loadReviewSettings({
    overrides: {
      isLlmEnabled: commandOptions.isLlmEnabled,
      isCacheEnabled: commandOptions.isCacheEnabled,
      reviewPromptVersion: commandOptions.reviewPromptVersion,
    },
  })
  const { reviewOptions, ...runSettings } = reviewSettings
  const missingApiKeys = findMissingApiKeys({ reviewOptions, environment })
  if (missingApiKeys.length > 0) {
    output.writeErr(
      `set ${missingApiKeys.join(' and ')} to run the benchmark with the model, or pass --no-llm\n`,
    )
    return 2
  }

  // build an advisory cache from the corpus fixture the labels were checked against. then run the splits under the signal watch
  const advisoryCacheDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-corpus-advisories-'),
  )
  try {
    await writeCorpusAdvisoryCache(advisoryCacheDirectory)
    const benchmarkRun = createCancellableBenchmarkRun({
      runSettings,
      runsDirectory,
      llmProvider,
    })
    const runOutcome = await runUntilSignal({
      run: () =>
        runSplits({
          commandOptions,
          output,
          reviewSettings,
          benchmarkRun,
          advisoryCacheDirectory,
          casesDirectory,
          resultsDirectory,
          token: environment.GITHUB_TOKEN,
        }),
      cancel: benchmarkRun.cancel,
      signalSource,
      exit,
    })
    return runOutcome.kind === 'cancelled' ? runOutcome.exitCode : 0
  } finally {
    await rm(advisoryCacheDirectory, { recursive: true, force: true })
  }
}

// the per-case pipeline of one command run, the abort signal the runner checks and the cancel that ends the running case
interface CancellableBenchmarkRun {
  pipeline: ReviewPipeline
  abortSignal: AbortSignal
  cancel: (signal: string) => Promise<void>
}

// the settings every case runs with and what the tests replace
interface CreateCancellableBenchmarkRunOptions {
  runSettings: RunSettings
  runsDirectory: string | undefined
  llmProvider: RunReviewOptions['llmProvider']
}

// build the per-case pipeline that keeps the running case, and the cancel that aborts the runner and ends that case
function createCancellableBenchmarkRun({
  runSettings,
  runsDirectory,
  llmProvider,
}: CreateCancellableBenchmarkRunOptions): CancellableBenchmarkRun {
  const abortController = new AbortController()
  let runningCase: RunningBenchmarkCase | undefined
  const pipeline = createBenchmarkPipeline({
    runSettings,
    runsDirectory,
    llmProvider,
    onCaseStart: (startedCase) => {
      runningCase = startedCase
    },
  })
  return {
    pipeline,
    abortSignal: abortController.signal,
    async cancel(signal) {
      // stop the runner before its next case and before it writes results
      abortController.abort(new Error(`cancelled by ${signal}`))

      // end the running case with its note. then release its source
      if (runningCase === undefined) {
        return
      }
      await runningCase.cancellation.cancel(signal)
      await runningCase.pullRequestSource.dispose()
    },
  }
}

// what the splits run with: the options and the output, the settings, the per-case pipeline and the directories
interface RunSplitsOptions {
  commandOptions: BenchmarkRunCommandOptions
  output: CliOutput
  reviewSettings: ReviewSettings
  benchmarkRun: CancellableBenchmarkRun
  advisoryCacheDirectory: string
  casesDirectory: string | undefined
  resultsDirectory: string | undefined
  token: string | undefined
}

// run each split and print its metrics line. the runner keeps its own offline flag
async function runSplits({
  commandOptions,
  output,
  reviewSettings,
  benchmarkRun,
  advisoryCacheDirectory,
  casesDirectory,
  resultsDirectory,
  token,
}: RunSplitsOptions): Promise<void> {
  const { reviewOptions } = reviewSettings
  const splits: BenchmarkSplit[] =
    commandOptions.split === 'all'
      ? [...benchmarkSplits]
      : [commandOptions.split]
  for (const split of splits) {
    const benchmarkRunResults = await runBenchmark({
      pipeline: benchmarkRun.pipeline,
      split,
      label: commandOptions.label,
      options: {
        casesDirectory,
        resultsDirectory,
        reviewOptions: {
          isLlmEnabled: reviewOptions.isLlmEnabled,
          isCacheEnabled: reviewOptions.isCacheEnabled,
          advisoryCacheDirectory,
          reviewModelId: reviewOptions.reviewModelId,
          summarizeModelId: reviewOptions.summarizeModelId,
          contextLines: reviewOptions.contextLines,
        },
        abortSignal: benchmarkRun.abortSignal,
        warn: (message) => output.writeErr(`${message}\n`),
        token,
      },
    })
    output.writeOut(`${formatMetricsLine(benchmarkRunResults)}\n`)
  }
}

/**
 * Writes the benchmark's advisory fixture into the advisory cache layout under the given directory.
 */
export async function writeCorpusAdvisoryCache(
  cacheDirectory: string,
): Promise<void> {
  // read the advisories and the snapshot the corpus labels were checked against
  const advisoryFixtureRead = await readAdvisoryFixture(
    benchmarkAdvisoryFixtureDirectory,
  )
  if (advisoryFixtureRead.problems.length > 0) {
    throw new Error(
      `the benchmark advisory fixture does not read: ${advisoryFixtureRead.problems.join(' ')}`,
    )
  }
  const snapshotJson: unknown = await Bun.file(
    join(benchmarkAdvisoryFixtureDirectory, 'snapshot.json'),
  ).json()

  // index them and write them where the advisory store loads from
  await writeAdvisoryCache({
    ecosystem: 'npm',
    cacheDirectory,
    advisoriesByPackage: indexAdvisoriesByPackage(
      advisoryFixtureRead.advisories,
    ),
    snapshot: advisorySnapshotSchema.parse(snapshotJson),
  })
}

// what a signal cancels: the running case's cancellation and the source to release
export interface RunningBenchmarkCase {
  cancellation: RunCancellation
  pullRequestSource: PullRequestSource
}

// the settings every case runs with and the directory the audit logs go under. onCaseStart gets each case as it starts
export interface CreateBenchmarkPipelineOptions {
  runSettings: RunSettings
  runsDirectory?: string
  llmProvider?: RunReviewOptions['llmProvider']
  onCaseStart?: (runningCase: RunningBenchmarkCase) => void
}

/**
 * Creates the pipeline a benchmark run calls per case: runReview with its own audit log and cancellation, throwing on an aborted run.
 */
export function createBenchmarkPipeline({
  runSettings,
  runsDirectory = defaultBenchmarkRunsDirectory,
  llmProvider,
  onCaseStart,
}: CreateBenchmarkPipelineOptions): ReviewPipeline {
  return async ({ pullRequestSource, reviewOptions }) => {
    // write each case's events to its own audit log. hand the caller what a signal cancels
    const runId = createRunId(new Date())
    const runAuditLog = openRunAuditLog({
      runId,
      runsDirectory,
    })
    const cancellation = createRunCancellation()
    onCaseStart?.({ cancellation, pullRequestSource })
    const reviewResult = await runReview({
      pullRequestSource,
      reviewOptions,
      auditSink: runAuditLog,
      runId,
      runSettings,
      llmProvider,
      cancellation,
    }).finally(() => runAuditLog.dispose())

    // an aborted run is a failed case
    const fatalError = reviewResult.errors.find(
      (stepError) => stepError.isFatal,
    )
    if (fatalError !== undefined) {
      throw new Error(`${fatalError.step}: ${fatalError.message}`)
    }
    return reviewResult
  }
}

// where show reads and how it writes
export interface RunBenchmarkShowCommandOptions {
  output: CliOutput
  resultsDirectory?: string
}

/**
 * Prints the metrics of the latest results file of each split, or says a split has none.
 */
export async function runBenchmarkShowCommand({
  output,
  resultsDirectory = join(resolveRepositoryRoot(), 'benchmark', 'results'),
}: RunBenchmarkShowCommandOptions): Promise<number> {
  let exitCode = 0
  for (const split of benchmarkSplits) {
    // say so when the split has never run
    const latestFile = Bun.file(join(resultsDirectory, `latest-${split}.json`))
    if (!(await latestFile.exists())) {
      output.writeOut(`${split}: no results yet\n`)
      continue
    }

    // print the metrics of a results file that parses
    const parseResult = benchmarkRunResultsSchema.safeParse(
      await latestFile.json(),
    )
    if (!parseResult.success) {
      output.writeErr(
        `${split}: latest results do not parse: ${describeZodError(parseResult.error)}\n`,
      )
      exitCode = 1
      continue
    }
    output.writeOut(`${formatMetricsLine(parseResult.data)}\n`)
  }
  return exitCode
}

/**
 * Formats the metrics of one results file as one line.
 */
export function formatMetricsLine(
  benchmarkRunResults: BenchmarkRunResults,
): string {
  const { score } = benchmarkRunResults
  const metricsParts = [
    `${benchmarkRunResults.split} ${benchmarkRunResults.label}`,
    `f1 ${score.f1.toFixed(3)}`,
    `precision ${score.precision.toFixed(3)}`,
    `recall ${score.recall.toFixed(3)}`,
    `clean false positives ${score.falsePositivesOnClean}`,
    `cost $${score.totalCostUsd.toFixed(4)}`,
    `${benchmarkRunResults.cases.length} cases`,
    benchmarkRunResults.finishedAt,
  ]
  return metricsParts.join(', ')
}
