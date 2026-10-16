// the rules that decide when a predicted finding matches an expected one: the detector check, then the dependency, code and secret rules
import type { ExpectedFinding } from '@/shared/benchmark'
import type {
  CodeReviewFinding,
  DependencyFinding,
  Finding,
  SecretFinding,
} from '@/shared/finding'

// vulnerabilityTypes the code rule treats as the same weakness
export const vulnerabilityTypeFamilies = [
  ['CWE-79', 'CWE-80'],
  ['CWE-22', 'CWE-23'],
] as const

// how far a predicted code-review range may sit from the expected range, in lines
export const codeReviewLineTolerance = 5

// how far a predicted secret line may sit from the expected line, in lines
export const secretLineTolerance = 2

// the two findings a match rule compares
export interface MatchesExpectedFindingOptions {
  expectedFinding: ExpectedFinding
  predictedFinding: Finding
}

/**
 * Tells whether a predicted finding satisfies the match rule of an expected finding.
 */
export function matchesExpectedFinding({
  expectedFinding,
  predictedFinding,
}: MatchesExpectedFindingOptions): boolean {
  // detectors must match before any other rule applies
  if (expectedFinding.detector !== predictedFinding.detector) {
    return false
  }

  // apply the rule of the detector
  switch (predictedFinding.detector) {
    case 'dependency':
      return matchesDependencyFinding({ expectedFinding, predictedFinding })
    case 'code-review':
      return matchesCodeReviewFinding({ expectedFinding, predictedFinding })
    case 'secrets':
      return matchesSecretFinding({ expectedFinding, predictedFinding })
  }
}

// the dependency pair the dependency rule compares
interface MatchesDependencyFindingOptions {
  expectedFinding: ExpectedFinding
  predictedFinding: DependencyFinding
}

// the dependency rule: same package, and the expected advisory id is the predicted id or one of its aliases
function matchesDependencyFinding({
  expectedFinding,
  predictedFinding,
}: MatchesDependencyFindingOptions): boolean {
  // the package names must be equal, compared exactly
  if (expectedFinding.packageName !== predictedFinding.packageName) {
    return false
  }

  // a label without an advisory id names nothing a prediction can meet
  if (expectedFinding.advisoryId === undefined) {
    return false
  }

  // the expected advisory id must be the predicted id or one of its aliases, compared exactly
  const predictedAdvisoryIds = [
    predictedFinding.advisoryId,
    ...predictedFinding.aliases,
  ]
  return predictedAdvisoryIds.includes(expectedFinding.advisoryId)
}

// the code-review pair the code rule compares
interface MatchesCodeReviewFindingOptions {
  expectedFinding: ExpectedFinding
  predictedFinding: CodeReviewFinding
}

// the code rule: same vulnerabilityType family, same file, and line ranges within the tolerance
function matchesCodeReviewFinding({
  expectedFinding,
  predictedFinding,
}: MatchesCodeReviewFindingOptions): boolean {
  // the vulnerabilityTypes must be equal or in the same family
  if (expectedFinding.vulnerabilityType === undefined) {
    return false
  }
  if (
    !areVulnerabilityTypesInSameFamily({
      firstVulnerabilityType: expectedFinding.vulnerabilityType,
      secondVulnerabilityType: predictedFinding.vulnerabilityType,
    })
  ) {
    return false
  }

  // an expected finding with no file matches on the vulnerabilityType alone
  if (expectedFinding.file === undefined) {
    return true
  }
  if (expectedFinding.file !== predictedFinding.file) {
    return false
  }

  // an expected finding with no lines matches on the file alone
  if (expectedFinding.startLine === undefined) {
    return true
  }

  // a prediction with no lines never meets a line range
  if (predictedFinding.startLine === undefined) {
    return false
  }

  // the predicted range must overlap the expected range widened by the tolerance on each side
  return doLineRangesOverlap({
    expectedRange: {
      startLine: expectedFinding.startLine,
      endLine: expectedFinding.endLine ?? expectedFinding.startLine,
    },
    predictedRange: {
      startLine: predictedFinding.startLine,
      endLine: predictedFinding.endLine ?? predictedFinding.startLine,
    },
    tolerance: codeReviewLineTolerance,
  })
}

// the two vulnerabilityTypes a family check compares
export interface AreVulnerabilityTypesInSameFamilyOptions {
  firstVulnerabilityType: string
  secondVulnerabilityType: string
}

/**
 * Tells whether two vulnerabilityTypes are equal or belong to the same family, ignoring case, the CWE prefix and leading zeros.
 */
export function areVulnerabilityTypesInSameFamily({
  firstVulnerabilityType,
  secondVulnerabilityType,
}: AreVulnerabilityTypesInSameFamilyOptions): boolean {
  // compare the normalized forms first
  const normalizedFirstVulnerabilityType = normalizeVulnerabilityType(
    firstVulnerabilityType,
  )
  const normalizedSecondVulnerabilityType = normalizeVulnerabilityType(
    secondVulnerabilityType,
  )
  if (normalizedFirstVulnerabilityType === normalizedSecondVulnerabilityType) {
    return true
  }

  // otherwise look for a family that holds both
  return vulnerabilityTypeFamilies.some((vulnerabilityTypeFamily) => {
    const familyMembers: readonly string[] = vulnerabilityTypeFamily
    return (
      familyMembers.includes(normalizedFirstVulnerabilityType) &&
      familyMembers.includes(normalizedSecondVulnerabilityType)
    )
  })
}

// write a vulnerabilityType as CWE- followed by its number without leading zeros, whatever case, prefix or separator it arrived with
function normalizeVulnerabilityType(vulnerabilityType: string): string {
  const upperCaseVulnerabilityType = vulnerabilityType.trim().toUpperCase()
  const vulnerabilityTypeNumber = upperCaseVulnerabilityType
    .replace(/^CWE[-\s]?/, '')
    .replace(/^0+(?=\d)/, '')
  return `CWE-${vulnerabilityTypeNumber}`
}

// a line range with both ends inclusive
interface LineRange {
  startLine: number
  endLine: number
}

// the two ranges an overlap check compares and how far apart they may sit
interface DoLineRangesOverlapOptions {
  expectedRange: LineRange
  predictedRange: LineRange
  tolerance: number
}

// tell whether the predicted range touches the expected range once that is widened by the tolerance on each side
function doLineRangesOverlap({
  expectedRange,
  predictedRange,
  tolerance,
}: DoLineRangesOverlapOptions): boolean {
  // widen the expected range by the tolerance on each side
  const widenedStartLine = expectedRange.startLine - tolerance
  const widenedEndLine = expectedRange.endLine + tolerance

  // the ranges overlap when neither one ends before the other starts
  return (
    predictedRange.startLine <= widenedEndLine &&
    predictedRange.endLine >= widenedStartLine
  )
}

// the secrets pair the secret rule compares
interface MatchesSecretFindingOptions {
  expectedFinding: ExpectedFinding
  predictedFinding: SecretFinding
}

// the secret rule: same file, and the predicted start line within the tolerance of the expected one
function matchesSecretFinding({
  expectedFinding,
  predictedFinding,
}: MatchesSecretFindingOptions): boolean {
  // a label without a file names nothing a prediction can meet
  if (expectedFinding.file === undefined) {
    return false
  }

  // the files must be equal
  if (expectedFinding.file !== predictedFinding.file) {
    return false
  }

  // both sides need a start line to measure the distance
  if (
    expectedFinding.startLine === undefined ||
    predictedFinding.startLine === undefined
  ) {
    return false
  }

  // the predicted start line must sit within the tolerance of the expected one
  const lineDistance = Math.abs(
    predictedFinding.startLine - expectedFinding.startLine,
  )
  return lineDistance <= secretLineTolerance
}
