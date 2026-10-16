// flattens findings into one row per finding with one value per table column
import type { Finding } from '../shared/finding'

// the table columns in display order
export const columnKeys = [
  'severity',
  'detector',
  'title',
  'location',
  'package',
  'advisory',
  'githubReviewed',
  'dependencyScope',
  'reachability',
  'matcherAgreement',
  'vulnerabilityType',
  'confidence',
  'introduced',
] as const
export type ColumnKey = (typeof columnKeys)[number]

// the columns that only some detectors fill in
type DetectorColumnKey =
  | 'package'
  | 'advisory'
  | 'githubReviewed'
  | 'dependencyScope'
  | 'reachability'
  | 'matcherAgreement'
  | 'vulnerabilityType'

// one table value. null means the column does not apply to the finding
export type CellValue = string | number | null

// one finding as table values
export interface ReportRow {
  findingId: string
  cells: Record<ColumnKey, CellValue>
}

// every detector column empty, the starting point for each detector
const emptyDetectorCells: Record<DetectorColumnKey, CellValue> = {
  package: null,
  advisory: null,
  githubReviewed: null,
  dependencyScope: null,
  reachability: null,
  matcherAgreement: null,
  vulnerabilityType: null,
}

/**
 * Maps each finding to a row of table values, with null where a column does not apply.
 */
export function toReportRows(findings: Finding[]): ReportRow[] {
  return findings.map(toReportRow)
}

/**
 * Maps one finding to a row of table values.
 */
export function toReportRow(finding: Finding): ReportRow {
  // read the columns every detector has
  const commonCells = {
    severity: finding.severity,
    detector: finding.detector,
    title: finding.title,
    location: formatLocation(finding),
    confidence: finding.confidence,
    introduced: finding.isIntroducedByPullRequest ? 'yes' : 'no',
  }

  // add the columns of the finding's own detector
  const detectorCells = toDetectorCells(finding)
  return { findingId: finding.id, cells: { ...commonCells, ...detectorCells } }
}

// join the file and line range, or null when the finding has no file
function formatLocation(finding: Finding): string | null {
  if (finding.file === undefined) {
    return null
  }
  if (finding.startLine === undefined) {
    return finding.file
  }
  if (finding.endLine === undefined || finding.endLine === finding.startLine) {
    return `${finding.file}:${finding.startLine}`
  }
  return `${finding.file}:${finding.startLine}-${finding.endLine}`
}

// read the detector-specific columns of a finding
function toDetectorCells(
  finding: Finding,
): Record<DetectorColumnKey, CellValue> {
  if (finding.detector === 'dependency') {
    return {
      ...emptyDetectorCells,
      package: `${finding.packageName}@${finding.version}`,
      advisory: finding.advisoryId,
      githubReviewed: finding.isGithubReviewed ? 'yes' : 'no',
      dependencyScope: finding.dependencyScope,
      reachability: finding.reachability,
      matcherAgreement: finding.matcherAgreement,
    }
  }
  if (finding.detector === 'code-review') {
    return {
      ...emptyDetectorCells,
      vulnerabilityType: finding.vulnerabilityType,
    }
  }
  return emptyDetectorCells
}
