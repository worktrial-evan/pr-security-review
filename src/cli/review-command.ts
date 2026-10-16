// the review command. it checks the keys and clones the pull request. then it runs the pipeline and writes the report beside the audit log
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
import { createRunId } from '@/pipeline/run-record'
import { runReview } from '@/pipeline/run-review'
import { clonePullRequest } from '@/pull-request-source/clone-pull-request'
import { parsePullRequestReference } from '@/pull-request-source/pull-request-reference'
import { renderHtmlReport } from '@/report/render-html'
import { renderJsonReport } from '@/report/render-json'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type {
  PullRequestReference,
  PullRequestSource,
} from '@/shared/pull-request-source'
import type { ReviewResult } from '@/shared/review'
import type { ReviewCommandOptions } from './program'
import {
  decideReviewExitCode,
  formatReviewSummary,
  reviewExitCodes,
} from './review-outcome'
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

// the parsed options and the environment to read tokens and keys from. also where to write. tests replace the opener
export interface RunReviewCommandOptions {
  commandOptions: ReviewCommandOptions
  environment: Record<string, string | undefined>
  output: CliOutput
  openPullRequestSource?: OpenPullRequestSource
}

/**
 * Reviews one pull request, writes the report and returns the exit status: 0, 1 when fail-on is met, 2 when the run could not finish.
 */
export async function runReviewCommand({
  commandOptions,
  environment,
  output,
  openPullRequestSource = clonePullRequestFromGitHub,
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

  // read the pull request reference and open the pull request
  let pullRequestSource: PullRequestSource
  try {
    pullRequestSource = await openPullRequestSource({
      pullRequestReference: parsePullRequestReference(
        commandOptions.pullRequest,
      ),
      token: environment.GITHUB_TOKEN,
      contextLines: reviewSettings.reviewOptions.contextLines,
    })
  } catch (error) {
    output.writeErr(`cannot read the pull request: ${describeError(error)}\n`)
    return reviewExitCodes.aborted
  }

  // review it and write the report
  const reviewResult = await reviewClonedPullRequest({
    pullRequestSource,
    reviewSettings,
    commandOptions,
  })
  const reportPath = await writeReport({ reviewResult, commandOptions })
  output.writeOut(`report: ${pathToFileURL(resolve(reportPath)).href}\n`)
  output.writeOut(`${formatReviewSummary(reviewResult)}\n`)
  for (const stepError of reviewResult.errors.filter(
    (error) => error.isFatal,
  )) {
    output.writeErr(`aborted at ${stepError.step}: ${stepError.message}\n`)
  }
  return decideReviewExitCode(reviewResult, commandOptions.failOnSeverity)
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

// the cloned source and the settings and the flags of one review
interface ReviewClonedPullRequestOptions {
  pullRequestSource: PullRequestSource
  reviewSettings: ReviewSettings
  commandOptions: ReviewCommandOptions
}

// run the pipeline with the run's audit log. then close the log and the source
async function reviewClonedPullRequest({
  pullRequestSource,
  reviewSettings,
  commandOptions,
}: ReviewClonedPullRequestOptions): Promise<ReviewResult> {
  const { reviewOptions, ...runSettings } = reviewSettings
  const runId = createRunId(new Date())
  const runAuditLog = openRunAuditLog({
    runId,
    runsDirectory: commandOptions.outDirectory,
  })
  try {
    return await runReview({
      pullRequestSource,
      reviewOptions,
      auditSink: runAuditLog,
      runId,
      runSettings,
    })
  } finally {
    runAuditLog.dispose()
    await pullRequestSource.dispose()
  }
}

// the result and the flags that say where and how to write it
interface WriteReportOptions {
  reviewResult: ReviewResult
  commandOptions: ReviewCommandOptions
}

// write the report in the chosen format into the run's directory and return its path
async function writeReport({
  reviewResult,
  commandOptions,
}: WriteReportOptions): Promise<string> {
  const runDirectory = join(
    commandOptions.outDirectory,
    reviewResult.metadata.runId,
  )
  await mkdir(runDirectory, { recursive: true })
  const reportText =
    commandOptions.format === 'json'
      ? renderJsonReport(reviewResult)
      : renderHtmlReport(reviewResult)
  const reportPath = join(runDirectory, `report.${commandOptions.format}`)
  await Bun.write(reportPath, reportText)
  return reportPath
}
