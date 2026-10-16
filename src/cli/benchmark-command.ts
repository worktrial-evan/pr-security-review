// the benchmark commands. run the pipeline over one or both splits with a per-case audit log. show the latest metrics
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
  type RunSettings,
} from '@/pipeline/review-settings'
import { openRunAuditLog } from '@/pipeline/run-audit-log'
import { createRunId } from '@/pipeline/run-record'
import { runReview } from '@/pipeline/run-review'
import { advisorySnapshotSchema } from '@/shared/advisory'
import { type BenchmarkSplit, benchmarkSplits } from '@/shared/benchmark'
import type { ReviewPipeline } from '@/shared/review'
import type { BenchmarkRunCommandOptions } from './program'
import type { CliOutput } from './terminal-text'

// the directory every benchmark case run writes its audit log under unless a caller names another
const defaultBenchmarkRunsDirectory = 'runs'

// the parsed options and the environment to read keys from. also where to write
export interface RunBenchmarkCommandOptions {
  commandOptions: BenchmarkRunCommandOptions
  environment: Record<string, string | undefined>
  output: CliOutput
}

/**
 * Runs the pipeline over the chosen splits, writes the results files and prints one metrics line per split.
 */
export async function runBenchmarkCommand({
  commandOptions,
  environment,
  output,
}: RunBenchmarkCommandOptions): Promise<number> {
  // build the settings and stop when a key is missing
  const { reviewOptions, ...runSettings } = await loadReviewSettings({
    overrides: {
      isLlmEnabled: commandOptions.isLlmEnabled,
      isCacheEnabled: commandOptions.isCacheEnabled,
      reviewPromptVersion: commandOptions.reviewPromptVersion,
    },
  })
  const missingApiKeys = findMissingApiKeys({ reviewOptions, environment })
  if (missingApiKeys.length > 0) {
    output.writeErr(
      `set ${missingApiKeys.join(' and ')} to run the benchmark with the model, or pass --no-llm\n`,
    )
    return 2
  }

  // build an advisory cache from the corpus fixture the labels were checked against
  const advisoryCacheDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-corpus-advisories-'),
  )
  try {
    await writeCorpusAdvisoryCache(advisoryCacheDirectory)

    // run each split. the runner keeps its own offline flag
    const splits: BenchmarkSplit[] =
      commandOptions.split === 'all'
        ? [...benchmarkSplits]
        : [commandOptions.split]
    for (const split of splits) {
      const benchmarkRunResults = await runBenchmark({
        pipeline: createBenchmarkPipeline({ runSettings }),
        split,
        label: commandOptions.label,
        options: {
          reviewOptions: {
            isLlmEnabled: reviewOptions.isLlmEnabled,
            isCacheEnabled: reviewOptions.isCacheEnabled,
            advisoryCacheDirectory,
            reviewModelId: reviewOptions.reviewModelId,
            summarizeModelId: reviewOptions.summarizeModelId,
            contextLines: reviewOptions.contextLines,
          },
        },
      })
      output.writeOut(`${formatMetricsLine(benchmarkRunResults)}\n`)
    }
  } finally {
    await rm(advisoryCacheDirectory, { recursive: true, force: true })
  }
  return 0
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

// the settings every case runs with and the directory the audit logs go under
export interface CreateBenchmarkPipelineOptions {
  runSettings: RunSettings
  runsDirectory?: string
}

/**
 * Creates the pipeline a benchmark run calls per case: runReview with its own audit log, throwing on an aborted run.
 */
export function createBenchmarkPipeline({
  runSettings,
  runsDirectory = defaultBenchmarkRunsDirectory,
}: CreateBenchmarkPipelineOptions): ReviewPipeline {
  return async ({ pullRequestSource, reviewOptions }) => {
    // write each case's events to its own audit log
    const runId = createRunId(new Date())
    const runAuditLog = openRunAuditLog({
      runId,
      runsDirectory,
    })
    const reviewResult = await runReview({
      pullRequestSource,
      reviewOptions,
      auditSink: runAuditLog,
      runId,
      runSettings,
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
