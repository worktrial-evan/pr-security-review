// the review command. it checks the keys and opens the pull request or the local repository. then it runs the pipeline under the signal watch and writes the report beside the audit log
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describeError } from '@/benchmark/error-messages'
import { findMissingApiKeys } from '@/pipeline/api-keys'
import {
  loadReviewSettings,
  type ReviewSettings,
  type ReviewSettingsOverrides,
} from '@/pipeline/review-settings'
import { openRunAuditLog } from '@/pipeline/run-audit-log'
import { createRunCancellation } from '@/pipeline/run-cancellation'
import { createRunId } from '@/pipeline/run-record'
import { type RunReviewOptions, runReview } from '@/pipeline/run-review'
import { clonePullRequest } from '@/pull-request-source/clone-pull-request'
import { GitPullRequestSource } from '@/pull-request-source/git-pull-request-source'
import { parsePullRequestReference } from '@/pull-request-source/pull-request-reference'
import { renderHtmlReport } from '@/report/render-html'
import { renderJsonReport } from '@/report/render-json'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type {
  PullRequestReference,
  PullRequestSource,
} from '@/shared/pull-request-source'
import type { ReviewResult } from '@/shared/review'
import type {
  ReportFormat,
  ReviewCommandOptions,
  ReviewTarget,
} from './program'
import {
  decideReviewExitCode,
  formatReviewSummary,
  reviewExitCodes,
} from './review-outcome'
import {
  type RunOutcome,
  runUntilSignal,
  type SignalSource,
} from './signal-cancellation'
import type { CliOutput } from './terminal-text'

// opens the pull request a reference names. the default clones it from GitHub
export type OpenPullRequestSource = (
  options: OpenPullRequestSourceOptions,
) => Promise<PullRequestSource>

// the pull request to open and the token to open it with. also the context lines its hunks keep
export interface OpenPullRequestSourceOptions {
  pullRequestReference: PullRequestReference
  token: string | undefined
  contextLines: number
}

// the parsed options and the environment to read tokens and keys from. also where to write
// tests replace the opener and the model provider and the signal source and the exit
export interface RunReviewCommandOptions {
  commandOptions: ReviewCommandOptions
  environment: Record<string, string | undefined>
  output: CliOutput
  openPullRequestSource?: OpenPullRequestSource
  llmProvider?: RunReviewOptions['llmProvider']
  signalSource?: SignalSource
  exit?: (exitCode: number) => void
}

// the runs directory a run directory is created under when --out names none
const defaultRunsDirectory = 'runs'

/**
 * Reviews one pull request or two local commits, writes the report and returns the exit status: 0, 1 when fail-on is met, 2 when the run could not finish, 128 plus the signal number when a signal cancelled it.
 */
export async function runReviewCommand({
  commandOptions,
  environment,
  output,
  openPullRequestSource = clonePullRequestFromGitHub,
  llmProvider,
  signalSource,
  exit,
}: RunReviewCommandOptions): Promise<number> {
  // build the settings and stop before any network call when a key is missing
  const reviewSettings = await loadReviewSettings({
    overrides: toSettingsOverrides(commandOptions),
  })
  const missingApiKeys = findMissingApiKeys({
    reviewOptions: reviewSettings.reviewOptions,
    environment,
  })
  if (missingApiKeys.length > 0) {
    output.writeErr(
      `set ${missingApiKeys.join(' and ')} to review with the model, or pass --no-llm\n`,
    )
    return reviewExitCodes.aborted
  }

  // open the target
  let pullRequestSource: PullRequestSource
  try {
    pullRequestSource = await openReviewTarget({
      target: commandOptions.target,
      environment,
      contextLines: reviewSettings.reviewOptions.contextLines,
      openPullRequestSource,
    })
  } catch (error) {
    output.writeErr(`cannot read the pull request: ${describeError(error)}\n`)
    return reviewExitCodes.aborted
  }

  // review it under the signal watch. a cancelled run exits with the signal's status and writes no report
  const runId = createRunId(new Date())
  const runDirectory =
    commandOptions.outDirectory ?? join(defaultRunsDirectory, runId)
  const reviewOutcome = await reviewPullRequestSource({
    pullRequestSource,
    reviewSettings,
    runId,
    runDirectory,
    llmProvider,
    signalSource,
    exit,
  })
  if (reviewOutcome.kind === 'cancelled') {
    return reviewOutcome.exitCode
  }

  // write the report beside the audit log and print the link and the summary
  const { value: reviewResult } = reviewOutcome
  const reportPath = await writeReport({
    reviewResult,
    runDirectory,
    format: commandOptions.format,
  })
  output.writeOut(`report: ${pathToFileURL(resolve(reportPath)).href}\n`)
  output.writeOut(`${formatReviewSummary(reviewResult)}\n`)
  for (const stepError of reviewResult.errors.filter(
    (error) => error.isFatal,
  )) {
    output.writeErr(`aborted at ${stepError.step}: ${stepError.message}\n`)
  }
  return decideReviewExitCode(reviewResult, commandOptions.failOnSeverity)
}

// the target to open and the environment that holds the token. also the context lines and the opener for the GitHub form
interface OpenReviewTargetOptions {
  target: ReviewTarget
  environment: Record<string, string | undefined>
  contextLines: number
  openPullRequestSource: OpenPullRequestSource
}

// open the local repository directly, or parse the reference and open the pull request
async function openReviewTarget({
  target,
  environment,
  contextLines,
  openPullRequestSource,
}: OpenReviewTargetOptions): Promise<PullRequestSource> {
  // the local form reads the two shas through git with no GitHub call and no token
  if (target.kind === 'local') {
    return new GitPullRequestSource({
      repositoryPath: target.repositoryPath,
      baseSha: target.baseSha,
      headSha: target.headSha,
      contextLines,
    })
  }

  // the GitHub form parses the reference and opens the pull request
  return openPullRequestSource({
    pullRequestReference: parsePullRequestReference(target.pullRequest),
    token: environment.GITHUB_TOKEN,
    contextLines,
  })
}

// clone the pull request's repository into the shared cache
async function clonePullRequestFromGitHub({
  pullRequestReference,
  token,
  contextLines,
}: OpenPullRequestSourceOptions): Promise<PullRequestSource> {
  return clonePullRequest({
    reference: pullRequestReference,
    cacheDirectory: join(resolveCacheDirectory(), 'pull-request-repositories'),
    token,
    contextLines,
  })
}

// turn the flags into settings overrides
function toSettingsOverrides(
  commandOptions: ReviewCommandOptions,
): ReviewSettingsOverrides {
  return {
    isLlmEnabled: commandOptions.isLlmEnabled,
    isCacheEnabled: commandOptions.isCacheEnabled,
    isOffline: commandOptions.isOffline,
    reviewModelId: commandOptions.reviewModelId,
    summarizeModelId: commandOptions.summarizeModelId,
    reviewPromptVersion: commandOptions.reviewPromptVersion,
    failOnSeverity: commandOptions.failOnSeverity,
  }
}

// the open source and the settings of one review. also the run id and the directory its log goes in and what the tests replace
interface ReviewPullRequestSourceOptions {
  pullRequestSource: PullRequestSource
  reviewSettings: ReviewSettings
  runId: string
  runDirectory: string
  llmProvider: RunReviewOptions['llmProvider']
  signalSource: SignalSource | undefined
  exit: ((exitCode: number) => void) | undefined
}

// run the pipeline with the run's audit log under the signal watch. a signal cancels the run and closes the log and the source before the exit
async function reviewPullRequestSource({
  pullRequestSource,
  reviewSettings,
  runId,
  runDirectory,
  llmProvider,
  signalSource,
  exit,
}: ReviewPullRequestSourceOptions): Promise<RunOutcome<ReviewResult>> {
  const { reviewOptions, ...runSettings } = reviewSettings
  const runAuditLog = openRunAuditLog({ runDirectory })
  const cancellation = createRunCancellation()

  // close the log and the source once. a cancel does it before the exit and a finished run after
  let isDisposed = false
  const dispose = async (): Promise<void> => {
    if (isDisposed) {
      return
    }
    isDisposed = true
    runAuditLog.dispose()
    await pullRequestSource.dispose()
  }

  try {
    return await runUntilSignal({
      run: () =>
        runReview({
          pullRequestSource,
          reviewOptions,
          auditSink: runAuditLog,
          runId,
          runSettings,
          llmProvider,
          cancellation,
        }),
      cancel: async (signal) => {
        await cancellation.cancel(signal)
        await dispose()
      },
      signalSource,
      exit,
    })
  } finally {
    await dispose()
  }
}

// the result and the run directory and the format to write it in
interface WriteReportOptions {
  reviewResult: ReviewResult
  runDirectory: string
  format: ReportFormat
}

// write the report in the chosen format into the run directory and return its path
async function writeReport({
  reviewResult,
  runDirectory,
  format,
}: WriteReportOptions): Promise<string> {
  await mkdir(runDirectory, { recursive: true })
  const reportText =
    format === 'json'
      ? renderJsonReport(reviewResult)
      : renderHtmlReport(reviewResult)
  const reportPath = join(runDirectory, `report.${format}`)
  await Bun.write(reportPath, reportText)
  return reportPath
}
