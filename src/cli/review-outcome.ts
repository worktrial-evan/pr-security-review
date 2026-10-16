// decides the exit status of a review and writes its one-line count summary
import { type Finding, type Severity, severities } from '@/shared/finding'
import type { ReviewResult } from '@/shared/review'

// the exit statuses of the review command
export const reviewExitCodes = { passed: 0, failOnMet: 1, aborted: 2 } as const

// the findings to check and the lowest severity that fails the review
export interface HasFindingAtOrAboveOptions {
  findings: Finding[]
  failOnSeverity: Severity
}

/**
 * Says whether an introduced finding is at or above the given severity. Pre-existing findings never count.
 */
export function hasFindingAtOrAbove({
  findings,
  failOnSeverity,
}: HasFindingAtOrAboveOptions): boolean {
  const failOnRank = severities.indexOf(failOnSeverity)
  return findings.some(
    (finding) =>
      finding.isIntroducedByPullRequest &&
      severities.indexOf(finding.severity) <= failOnRank,
  )
}

/**
 * Returns the exit status of a review: 2 when it aborted, 1 when the fail-on severity is met, 0 otherwise.
 */
export function decideReviewExitCode(
  reviewResult: ReviewResult,
  failOnSeverity: Severity | undefined,
): number {
  // an aborted run fails whatever it found
  if (reviewResult.errors.some((stepError) => stepError.isFatal)) {
    return reviewExitCodes.aborted
  }
  if (failOnSeverity === undefined) {
    return reviewExitCodes.passed
  }
  const isFailOnMet = hasFindingAtOrAbove({
    findings: reviewResult.findings,
    failOnSeverity,
  })
  return isFailOnMet ? reviewExitCodes.failOnMet : reviewExitCodes.passed
}

/**
 * Summarizes a review in one line: introduced findings by severity, pre-existing findings, errors and degraded steps.
 */
export function formatReviewSummary(reviewResult: ReviewResult): string {
  // count the introduced findings at each severity that has any
  const introducedFindings = reviewResult.findings.filter(
    (finding) => finding.isIntroducedByPullRequest,
  )
  const severityCounts = severities
    .map((severity) => ({
      severity,
      count: introducedFindings.filter(
        (finding) => finding.severity === severity,
      ).length,
    }))
    .filter(({ count }) => count > 0)
  const severityText = severityCounts
    .map(({ severity, count }) => `${count} ${severity}`)
    .join(', ')

  // join the counts into one line
  const preExistingCount =
    reviewResult.findings.length - introducedFindings.length
  const summaryParts = [
    `${introducedFindings.length} introduced${severityText === '' ? '' : ` (${severityText})`}`,
    `${preExistingCount} pre-existing`,
    `${reviewResult.errors.length} errors`,
    `${reviewResult.metadata.degradedSteps.length} degraded steps`,
  ]
  return summaryParts.join(', ')
}
