// the grounding filter: checks a model finding against the chunk's file, the CWE allowlist and the file's added lines, and names the first reason to drop it
import type { AddedLine } from '@/shared/pull-request-source'
import type { ModelFinding } from './model-output'
import { isAllowedVulnerabilityType } from './vulnerability-type-allowlist'

// why a finding is dropped, in the order the checks run
export const groundingRejectionReasons = [
  'file-mismatch',
  'vulnerability-type-not-allowed',
  'evidence-not-added',
  'range-not-added',
] as const
export type GroundingRejectionReason =
  (typeof groundingRejectionReasons)[number]

// a finding to check, the file of the chunk it answers and the lines the pull request added to that file
export interface GroundFindingOptions {
  finding: ModelFinding
  file: string
  addedLines: AddedLine[]
}

// whether a finding is kept, with the first reason when it is not
export type GroundingVerdict =
  | { kind: 'grounded' }
  | { kind: 'rejected'; reason: GroundingRejectionReason }

/**
 * Checks a model finding against the chunk's file, the CWE allowlist and the added lines, and returns the first reason to reject it.
 */
export function groundFinding({
  finding,
  file,
  addedLines,
}: GroundFindingOptions): GroundingVerdict {
  // reject a finding that names another file
  if (finding.file !== file) {
    return { kind: 'rejected', reason: 'file-mismatch' }
  }

  // reject a CWE outside the allowlist
  if (!isAllowedVulnerabilityType(finding.vulnerabilityType)) {
    return { kind: 'rejected', reason: 'vulnerability-type-not-allowed' }
  }

  // reject an evidence line that is not exactly an added line
  if (!hasOnlyAddedEvidence(finding, addedLines)) {
    return { kind: 'rejected', reason: 'evidence-not-added' }
  }

  // reject a range that touches no added line
  if (!isRangeTouchingAddedLine(finding, addedLines)) {
    return { kind: 'rejected', reason: 'range-not-added' }
  }

  return { kind: 'grounded' }
}

// tell whether every evidence line equals the text of an added line, with no trimming
function hasOnlyAddedEvidence(
  finding: ModelFinding,
  addedLines: AddedLine[],
): boolean {
  // collect the added texts once
  const addedLineTexts = new Set(addedLines.map((addedLine) => addedLine.text))

  return finding.evidence.every((evidenceLine) =>
    addedLineTexts.has(evidenceLine),
  )
}

// tell whether the line number of some added line falls inside the finding's range
function isRangeTouchingAddedLine(
  finding: ModelFinding,
  addedLines: AddedLine[],
): boolean {
  return addedLines.some(
    (addedLine) =>
      finding.startLine <= addedLine.line && addedLine.line <= finding.endLine,
  )
}
