// collapses model findings that share a file and CWE on overlapping line ranges, keeping the higher confidence, and orders the result
import { compareStrings } from '@/shared/compare-strings'
import type { ModelFinding } from './model-output'

// two findings to compare
interface CompareFindingsOptions {
  first: ModelFinding
  second: ModelFinding
}

/**
 * Drops every finding that a more confident finding with the same file and CWE overlaps, or that a kept finding of equal confidence precedes, and orders the rest by file, start line, end line and CWE.
 */
export function dedupeFindings(findings: ModelFinding[]): ModelFinding[] {
  // sort a copy by position, with the higher confidence first at the same position
  const sortedFindings = [...findings].sort((first, second) =>
    compareFindingsByPositionThenConfidence({ first, second }),
  )

  // keep each finding in order unless another finding beats it
  const keptFindings: ModelFinding[] = []
  for (const finding of sortedFindings) {
    if (isBeaten({ finding, sortedFindings, keptFindings })) {
      continue
    }
    keptFindings.push(finding)
  }

  return keptFindings
}

// order two findings by position, and put the higher confidence first at the same position
function compareFindingsByPositionThenConfidence({
  first,
  second,
}: CompareFindingsOptions): number {
  // order by position first
  const positionOrder = compareFindingsByPosition({ first, second })
  if (positionOrder !== 0) {
    return positionOrder
  }

  return second.confidence - first.confidence
}

// order two findings by file, then start line, then end line, then cwe. strings compare by code unit
function compareFindingsByPosition({
  first,
  second,
}: CompareFindingsOptions): number {
  // order by file first
  const fileOrder = compareStrings({ first: first.file, second: second.file })
  if (fileOrder !== 0) {
    return fileOrder
  }

  // then by start line, end line and cwe
  if (first.startLine !== second.startLine) {
    return first.startLine - second.startLine
  }
  if (first.endLine !== second.endLine) {
    return first.endLine - second.endLine
  }
  return compareStrings({ first: first.cwe, second: second.cwe })
}

// the finding to judge, every finding in sorted order and the findings kept so far
interface IsBeatenOptions {
  finding: ModelFinding
  sortedFindings: ModelFinding[]
  keptFindings: ModelFinding[]
}

// tell whether a finding loses: a finding with the same file and cwe overlaps it with a higher confidence, or a kept one overlaps it with an equal confidence
function isBeaten({
  finding,
  sortedFindings,
  keptFindings,
}: IsBeatenOptions): boolean {
  // a more confident overlapping finding wins, kept or not
  const hasMoreConfidentOverlap = sortedFindings.some(
    (otherFinding) =>
      isOverlappingDuplicate({ first: finding, second: otherFinding }) &&
      otherFinding.confidence > finding.confidence,
  )
  if (hasMoreConfidentOverlap) {
    return true
  }

  // a kept overlapping finding of equal confidence comes earlier in position order and wins the tie
  return keptFindings.some(
    (keptFinding) =>
      isOverlappingDuplicate({ first: finding, second: keptFinding }) &&
      keptFinding.confidence === finding.confidence,
  )
}

// tell whether two findings share a file and cwe and their line ranges overlap. ranges that share an end line overlap
function isOverlappingDuplicate({
  first,
  second,
}: CompareFindingsOptions): boolean {
  if (first.file !== second.file || first.cwe !== second.cwe) {
    return false
  }
  return first.startLine <= second.endLine && second.startLine <= first.endLine
}
