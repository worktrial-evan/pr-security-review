// the assemble-result step: builds the review result from the run record and validates it against the contract
import type { AdvisorySnapshot } from '@/shared/advisory'
import type { Finding } from '@/shared/finding'
import type { PullRequestDescription } from '@/shared/pull-request-source'
import { type ReviewResult, reviewResultSchema } from '@/shared/review'
import type { RunRecord } from './run-record'

// the record of the run and what its steps produced
export interface AssembleReviewResultOptions {
  runRecord: RunRecord
  pullRequestDescription: PullRequestDescription | undefined
  findings: Finding[]
  advisorySnapshot: AdvisorySnapshot | undefined
}

/**
 * Builds the review result from the run record and the findings and parses it through the review result schema.
 */
export function assembleReviewResult({
  runRecord,
  pullRequestDescription,
  findings,
  advisorySnapshot,
}: AssembleReviewResultOptions): ReviewResult {
  // copy the run record into the metadata. a run that never described its pull request has empty shas
  const reviewResult: ReviewResult = {
    metadata: {
      runId: runRecord.runId,
      startedAt: runRecord.startedAt,
      finishedAt: runRecord.now().toISOString(),
      pullRequestReference: pullRequestDescription?.pullRequestReference,
      baseSha: pullRequestDescription?.baseSha ?? '',
      headSha: pullRequestDescription?.headSha ?? '',
      stepDurations: { ...runRecord.stepDurations },
      totalCostUsd: runRecord.costMeter.totalCostUsd,
      advisorySnapshot,
      promptVersions: { ...runRecord.promptVersions },
      modelIds: { ...runRecord.modelIds },
      groundingRejectionCount: runRecord.groundingRejectionCount,
      suspectedPromptInjectionCount: runRecord.suspectedPromptInjectionCount,
      degradedSteps: [...runRecord.degradedSteps],
    },
    findings,
    errors: [...runRecord.errors],
  }

  // drop the optional fields the run did not fill. then validate
  const { metadata } = reviewResult
  if (metadata.pullRequestReference === undefined) {
    delete metadata.pullRequestReference
  }
  if (metadata.advisorySnapshot === undefined) {
    delete metadata.advisorySnapshot
  }
  return reviewResultSchema.parse(reviewResult)
}
