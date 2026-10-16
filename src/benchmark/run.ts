// runs a review pipeline over one split of the benchmark corpus, scores the outcomes and writes the results files and page
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { runGit } from '@/pull-request-source/git-command'
import type { AuditSink } from '@/shared/audit'
import type { BenchmarkSplit } from '@/shared/benchmark'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type {
  ReviewOptions,
  ReviewPipeline,
  ReviewResult,
} from '@/shared/review'
import {
  openPullRequestSource,
  type PullRequestSourceOpen,
} from './case-source'
import {
  benchmarkAdvisoryCacheDirectory,
  type LoadedBenchmarkCase,
  loadBenchmarkCases,
  resolveRepositoryRoot,
} from './cases'
import { describeError } from './error-messages'
import { renderResultsPage } from './results-page'
import {
  type BenchmarkRunResults,
  benchmarkRunResultsSchema,
} from './run-results'
import { type BenchmarkCaseOutcome, scoreBenchmark } from './score'

// where a run reads and writes, and what it may override. each field has a default
export interface RunBenchmarkRunOptions {
  casesDirectory?: string
  resultsDirectory?: string
  cacheDirectory?: string
  reviewOptions?: Partial<ReviewOptions>
  auditSink?: AuditSink
  now?: () => Date
  gitSha?: string
}

// what runBenchmark needs: the pipeline, the split, a label for the results files and the run options
export interface RunBenchmarkOptions {
  pipeline: ReviewPipeline
  split: BenchmarkSplit
  label: string
  options?: RunBenchmarkRunOptions
}

// the review options a run uses unless the caller overrides them
const defaultReviewOptions: ReviewOptions = {
  isLlmEnabled: true,
  isCacheEnabled: true,
  isOffline: true,
  advisoryCacheDirectory: benchmarkAdvisoryCacheDirectory,
  reviewModelId: '',
  summarizeModelId: '',
  contextLines: 30,
}

// an audit sink that keeps nothing
const discardingAuditSink: AuditSink = {
  async write(): Promise<void> {},
}

// the shape of the advisory snapshot file this module reads from it
const advisorySnapshotDateSchema = z.object({ fetchedAt: z.string() })

// how one case ran: the pipeline returned a result, threw, or the case could not run
type BenchmarkCaseRun =
  | {
      status: 'completed'
      caseOutcome: BenchmarkCaseOutcome
      reviewResult: ReviewResult
    }
  | { status: 'failed'; caseOutcome: BenchmarkCaseOutcome }
  | { status: 'skipped'; caseOutcome: BenchmarkCaseOutcome; warning: string }

/**
 * Runs the pipeline over every case of the split, scores the outcomes and writes the results files and page.
 */
export async function runBenchmark({
  pipeline,
  split,
  label,
  options = {},
}: RunBenchmarkOptions): Promise<BenchmarkRunResults> {
  // resolve every option to its default
  const {
    casesDirectory,
    resultsDirectory = join(resolveRepositoryRoot(), 'benchmark', 'results'),
    cacheDirectory = resolveCacheDirectory(),
    auditSink = discardingAuditSink,
    now = () => new Date(),
  } = options
  const reviewOptions: ReviewOptions = {
    ...defaultReviewOptions,
    ...options.reviewOptions,
    isOffline: true,
  }

  // run every case of the split in id order
  const startedAt = now()
  const loadedCases = await loadBenchmarkCases({ casesDirectory, split })
  const caseRuns: BenchmarkCaseRun[] = []
  for (const loadedCase of loadedCases) {
    const caseRun = await runBenchmarkCase({
      loadedCase,
      pipeline,
      reviewOptions,
      auditSink,
      cacheDirectory,
      now,
    })
    caseRuns.push(caseRun)
  }

  // gather the provenance, score the run and write the results beside the page
  const provenance = await collectRunProvenance({
    caseRuns,
    advisoryCacheDirectory: reviewOptions.advisoryCacheDirectory,
    gitSha: options.gitSha,
  })
  const results = buildRunResults({
    label,
    split,
    startedAt,
    finishedAt: now(),
    isLlmCacheUsed: reviewOptions.isCacheEnabled,
    provenance,
    caseRuns,
  })
  await writeResultsFiles({ results, resultsDirectory, timestamp: startedAt })
  return results
}

// what running one case needs
interface RunBenchmarkCaseOptions {
  loadedCase: LoadedBenchmarkCase
  pipeline: ReviewPipeline
  reviewOptions: ReviewOptions
  auditSink: AuditSink
  cacheDirectory: string
  now: () => Date
}

// run the pipeline on one case and turn the result into an outcome the scorer takes
async function runBenchmarkCase({
  loadedCase,
  pipeline,
  reviewOptions,
  auditSink,
  cacheDirectory,
  now,
}: RunBenchmarkCaseOptions): Promise<BenchmarkCaseRun> {
  // open the pull request source, skipping or failing the case when that is not possible
  const { benchmarkCase } = loadedCase
  const sourceOpen = await openPullRequestSource({ loadedCase, cacheDirectory })
  if (sourceOpen.kind !== 'opened') {
    return toUnrunCaseRun({ benchmarkCase, sourceOpen })
  }

  // review the pull request, always releasing the source afterwards
  const { pullRequestSource } = sourceOpen
  const caseStartedAt = now()
  try {
    const reviewResult = await pipeline({
      pullRequestSource,
      reviewOptions,
      auditSink,
    })
    return {
      status: 'completed',
      reviewResult,
      caseOutcome: {
        benchmarkCase,
        findings: reviewResult.findings,
        costUsd: reviewResult.metadata.totalCostUsd,
        durationMs: now().getTime() - caseStartedAt.getTime(),
        status: 'completed',
      },
    }
  } catch (error) {
    return {
      status: 'failed',
      caseOutcome: {
        benchmarkCase,
        findings: [],
        costUsd: 0,
        durationMs: now().getTime() - caseStartedAt.getTime(),
        status: 'failed',
        errorMessage: describeError(error),
      },
    }
  } finally {
    await pullRequestSource.dispose()
  }
}

// a case and the open of its source that did not produce one
interface ToUnrunCaseRunOptions {
  benchmarkCase: LoadedBenchmarkCase['benchmarkCase']
  sourceOpen: Exclude<PullRequestSourceOpen, { kind: 'opened' }>
}

// the run of a case the pipeline never saw: failed with its error, or skipped with a warning printed on stderr
function toUnrunCaseRun({
  benchmarkCase,
  sourceOpen,
}: ToUnrunCaseRunOptions): BenchmarkCaseRun {
  // a failed open fails the case with no cost and no findings
  if (sourceOpen.kind === 'failed') {
    return {
      status: 'failed',
      caseOutcome: {
        benchmarkCase,
        findings: [],
        costUsd: 0,
        durationMs: 0,
        status: 'failed',
        errorMessage: sourceOpen.errorMessage,
      },
    }
  }

  // a skipped open warns on stderr and records the reason
  const warning = `${benchmarkCase.id}: skipped, ${sourceOpen.reason}`
  console.error(`warning: ${warning}`)
  return {
    status: 'skipped',
    warning,
    caseOutcome: {
      benchmarkCase,
      findings: [],
      costUsd: 0,
      durationMs: 0,
      status: 'skipped',
      errorMessage: sourceOpen.reason,
    },
  }
}

// where the results of a run came from: the code, the prompts, the models and the advisories
interface RunProvenance {
  gitSha: string
  promptVersions: Record<string, string>
  modelIds: Record<string, string>
  advisorySnapshotDate: string
}

// the case runs to read the metadata from, the advisory cache to date and the sha to use instead of asking git
interface CollectRunProvenanceOptions {
  caseRuns: BenchmarkCaseRun[]
  advisoryCacheDirectory: string
  gitSha?: string
}

// gather the provenance of a run from the completed cases, the repository and the advisory cache
async function collectRunProvenance({
  caseRuns,
  advisoryCacheDirectory,
  gitSha,
}: CollectRunProvenanceOptions): Promise<RunProvenance> {
  // merge the prompt versions and model ids of every completed case
  const reviewResults = caseRuns.flatMap((caseRun) =>
    caseRun.status === 'completed' ? [caseRun.reviewResult] : [],
  )
  const promptVersions = mergeMetadataRecords(
    reviewResults.map((reviewResult) => reviewResult.metadata.promptVersions),
  )
  const modelIds = mergeMetadataRecords(
    reviewResults.map((reviewResult) => reviewResult.metadata.modelIds),
  )

  // read the repository sha and the advisory snapshot date
  return {
    gitSha: gitSha ?? (await readRepositoryGitSha()),
    promptVersions,
    modelIds,
    advisorySnapshotDate: await readAdvisorySnapshotDate(
      advisoryCacheDirectory,
    ),
  }
}

// what the results of a run are built from
interface BuildRunResultsOptions {
  label: string
  split: BenchmarkSplit
  startedAt: Date
  finishedAt: Date
  isLlmCacheUsed: boolean
  provenance: RunProvenance
  caseRuns: BenchmarkCaseRun[]
}

// score the case runs and assemble the validated results object
function buildRunResults({
  label,
  split,
  startedAt,
  finishedAt,
  isLlmCacheUsed,
  provenance,
  caseRuns,
}: BuildRunResultsOptions): BenchmarkRunResults {
  // score the outcomes and collect the warning of every skipped case
  const score = scoreBenchmark({
    caseOutcomes: caseRuns.map((caseRun) => caseRun.caseOutcome),
  })
  const warnings = caseRuns.flatMap((caseRun) =>
    caseRun.status === 'skipped' ? [caseRun.warning] : [],
  )

  // validate the results so every number and timestamp is in shape
  return benchmarkRunResultsSchema.parse({
    label,
    split,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ...provenance,
    isLlmCacheUsed,
    score,
    cases: score.caseDetails,
    warnings,
  })
}

// read the sha of the repository's head commit, or an empty string when git cannot say
async function readRepositoryGitSha(): Promise<string> {
  // ask git for the head commit of the repository. an empty sha stands for a tree git cannot describe
  try {
    const revParseOutput = await runGit({
      repositoryPath: resolveRepositoryRoot(),
      gitArguments: ['rev-parse', 'HEAD'],
    })
    return revParseOutput.trim()
  } catch {
    return ''
  }
}

// read fetchedAt from the npm snapshot file of the advisory cache. return an empty string when it is missing or malformed
async function readAdvisorySnapshotDate(
  advisoryCacheDirectory: string,
): Promise<string> {
  // a missing snapshot file dates nothing
  const snapshotFile = Bun.file(
    join(advisoryCacheDirectory, 'advisories', 'npm', 'snapshot.json'),
  )
  if (!(await snapshotFile.exists())) {
    return ''
  }

  // read the date from a snapshot that parses
  try {
    const snapshotJson: unknown = await snapshotFile.json()
    const parseResult = advisorySnapshotDateSchema.safeParse(snapshotJson)
    return parseResult.success ? parseResult.data.fetchedAt : ''
  } catch {
    return ''
  }
}

// merge the records of every result into one. a later result wins on a shared key
function mergeMetadataRecords(
  records: Record<string, string>[],
): Record<string, string> {
  return Object.assign({}, ...records)
}

// the results to write, where to write them and the time the file names carry
interface WriteResultsFilesOptions {
  results: BenchmarkRunResults
  resultsDirectory: string
  timestamp: Date
}

// write the timestamped json and html files and the latest pair of the split
async function writeResultsFiles({
  results,
  resultsDirectory,
  timestamp,
}: WriteResultsFilesOptions): Promise<void> {
  // render both forms once
  const resultsJson = `${JSON.stringify(results, null, 2)}\n`
  const resultsHtml = renderResultsPage(results)

  // name the files by the timestamp and the label, with every character outside a file name replaced by a dash
  const fileLabel = results.label.replace(/[^A-Za-z0-9._-]/g, '-')
  const timestampedName = `${formatFileTimestamp(timestamp)}-${fileLabel}`
  const latestName = `latest-${results.split}`

  // write each form under its timestamped name and its latest name
  await mkdir(resultsDirectory, { recursive: true })
  await Bun.write(
    join(resultsDirectory, `${timestampedName}.json`),
    resultsJson,
  )
  await Bun.write(
    join(resultsDirectory, `${timestampedName}.html`),
    resultsHtml,
  )
  await Bun.write(join(resultsDirectory, `${latestName}.json`), resultsJson)
  await Bun.write(join(resultsDirectory, `${latestName}.html`), resultsHtml)
}

// write a date in basic iso form in utc: 20261015T201500Z
function formatFileTimestamp(date: Date): string {
  // drop the separators and the milliseconds of the iso form
  const isoDate = date.toISOString()
  const withoutSeparators = isoDate.replace(/[-:]/g, '')
  return withoutSeparators.replace(/\.\d{3}Z$/, 'Z')
}
