// the code-review step. it skips the review when the llm is off and otherwise runs the code reviewer at the live prompt version
import { reviewCode as reviewCodeWithModel } from '@/code-review/review-code'
import type { AuditSink } from '@/shared/audit'
import type { CodeReviewFinding } from '@/shared/finding'
import type { LlmClient } from '@/shared/llm'
import type { ChangedFile } from '@/shared/pull-request-source'
import type { ReviewOptions } from '@/shared/review'
import { ReviewCostLimitError } from './metered-llm-client'
import { addDegradedStep, type RunRecord, writeRunNote } from './run-record'

// what the reviewer is given for one run
export interface ReviewCodeOptions {
  changedFiles: ChangedFile[]
  llmClient: LlmClient
  auditSink: AuditSink
  runId: string
  contextLines: number
  modelId: string
  promptVersion: string
}

// what the reviewer returns. promptVersion is undefined when no prompt was loaded. unreviewedFiles lists the files the cost limit stopped the review before
export interface CodeReviewOutput {
  findings: CodeReviewFinding[]
  groundingRejectionCount: number
  injectionAttemptCount: number
  promptVersion: string | undefined
  degradedReasons: string[]
  unreviewedFiles: string[]
}

// a function that reviews changed files for security issues
export type ReviewCode = (
  options: ReviewCodeOptions,
) => Promise<CodeReviewOutput>

// the output of a review that found nothing and ran nothing
export const emptyCodeReviewOutput: CodeReviewOutput = {
  findings: [],
  groundingRejectionCount: 0,
  injectionAttemptCount: 0,
  promptVersion: undefined,
  degradedReasons: [],
  unreviewedFiles: [],
}

/**
 * Reviews the changed files with the code-review module at the given prompt version. Chunks whose answer failed validation degrade the step and the cost limit stops it.
 */
export async function reviewCodeWithReviewer({
  changedFiles,
  llmClient,
  auditSink,
  runId,
  contextLines,
  modelId,
  promptVersion,
}: ReviewCodeOptions): Promise<CodeReviewOutput> {
  const codeReviewResult = await reviewCodeWithModel({
    changedFiles,
    llmClient,
    auditSink,
    runId,
    isLlmEnabled: true,
    contextLines,
    modelId,
    promptVersion: Number(promptVersion),
    isStopError: (error) => error instanceof ReviewCostLimitError,
  })
  const { failedChunkCount } = codeReviewResult
  return {
    findings: codeReviewResult.findings,
    groundingRejectionCount: codeReviewResult.groundingRejectionCount,
    injectionAttemptCount: codeReviewResult.injectionAttemptCount,
    promptVersion: codeReviewResult.promptVersion,
    degradedReasons:
      failedChunkCount > 0
        ? [
            `${failedChunkCount} chunks skipped after their answer failed validation twice`,
          ]
        : [],
    unreviewedFiles: codeReviewResult.unreviewedFiles,
  }
}

// what one code review needs. the review model client is undefined when the llm is off
export interface RunCodeReviewOptions {
  reviewedFiles: ChangedFile[]
  reviewCode: ReviewCode
  reviewLlmClient: LlmClient | undefined
  reviewOptions: ReviewOptions
  reviewPromptVersion: string
  runRecord: RunRecord
}

/**
 * Runs the reviewer over the reviewed files, or notes the skip and returns nothing when the llm is off. Files the cost limit left unreviewed degrade the step.
 */
export async function runCodeReview({
  reviewedFiles,
  reviewCode,
  reviewLlmClient,
  reviewOptions,
  reviewPromptVersion,
  runRecord,
}: RunCodeReviewOptions): Promise<CodeReviewOutput> {
  // skip the review without a model
  if (reviewLlmClient === undefined) {
    await writeRunNote({
      runRecord,
      step: 'code-review',
      payload: { message: 'code review skipped because the llm is disabled' },
    })
    return emptyCodeReviewOutput
  }

  // review the files and list the ones the cost limit left unreviewed
  const codeReviewOutput = await reviewCode({
    changedFiles: reviewedFiles,
    llmClient: reviewLlmClient,
    auditSink: runRecord.auditSink,
    runId: runRecord.runId,
    contextLines: reviewOptions.contextLines,
    modelId: reviewOptions.reviewModelId,
    promptVersion: reviewPromptVersion,
  })
  addUnreviewedFilesDegradedStep({
    runRecord,
    unreviewedFiles: codeReviewOutput.unreviewedFiles,
  })
  return codeReviewOutput
}

// the record to degrade and the files the cost limit left unreviewed
interface AddUnreviewedFilesDegradedStepOptions {
  runRecord: RunRecord
  unreviewedFiles: string[]
}

// list the files the cost limit left unreviewed under the degraded steps. no file leaves the record as it is
function addUnreviewedFilesDegradedStep({
  runRecord,
  unreviewedFiles,
}: AddUnreviewedFilesDegradedStepOptions): void {
  if (unreviewedFiles.length === 0) {
    return
  }
  addDegradedStep({
    runRecord,
    step: 'code-review',
    reason: `cost limit reached, ${unreviewedFiles.length} files not reviewed: ${unreviewedFiles.join(', ')}`,
  })
}
