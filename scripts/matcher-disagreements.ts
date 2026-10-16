// classifies the differences between the hand-written matcher and the oracle over one lockfile, and reads the accepted rows of docs/matcher-disagreements.md
import { compareCodeUnitOrder } from '@/matcher/affected-range'
import type {
  DependencyFinding,
  OracleMatch,
  OraclePackage,
} from '@/matcher/dependency-finding'
import type { DependencyVersion } from '@/shared/dependency'
import { normalizePackageName } from '@/shared/package-name'

// what differs: the packages one matcher saw, or the advisories matched for a package both saw
export const disagreementKinds = ['package-set', 'advisory-set'] as const
export type DisagreementKind = (typeof disagreementKinds)[number]

// which matcher reported the entry the other did not
export const disagreementSides = ['handwritten-only', 'oracle-only'] as const
export type DisagreementSide = (typeof disagreementSides)[number]

// one entry reported by one matcher and not the other. advisoryIds is empty for a package-set difference
export interface Disagreement {
  lockfilePath: string
  packageKey: string
  kind: DisagreementKind
  side: DisagreementSide
  advisoryIds: string[]
}

// what both matchers produced for one lockfile
export interface ClassifyDisagreementsOptions {
  lockfilePath: string
  dependencyVersions: DependencyVersion[]
  handwrittenFindings: DependencyFinding[]
  oraclePackages: OraclePackage[]
  oracleMatches: OracleMatch[]
}

// the package version to key
interface ToPackageKeyOptions {
  packageName: string
  version: string
}

// one package version both sides saw, with everything each side matched
interface ClassifyAdvisoryGroupsOptions {
  lockfilePath: string
  packageKey: string
  handwrittenFindings: DependencyFinding[]
  oracleMatches: OracleMatch[]
}

// the two id lists to compare
interface ShareAnyIdOptions {
  firstIds: string[]
  secondIds: string[]
}

// the column positions of the ids cell and the ruling in the table, and how many leading columns make the key
const idsColumnIndex = 4
const rulingColumnIndex = 5
const keyColumnCount = 5

// the ruling value of an accepted row
const acceptedRuling = 'accepted'

/** Lists every package or advisory group one matcher reported and the other did not, sorted. */
export function classifyDisagreements({
  lockfilePath,
  dependencyVersions,
  handwrittenFindings,
  oraclePackages,
  oracleMatches,
}: ClassifyDisagreementsOptions): Disagreement[] {
  // key every package version each side saw by its real name and version
  const handwrittenPackageKeys = new Set(
    dependencyVersions.map((dependencyVersion) =>
      toPackageKey({
        packageName:
          dependencyVersion.realPackageName ?? dependencyVersion.name,
        version: dependencyVersion.version,
      }),
    ),
  )
  const oraclePackageKeys = new Set(oraclePackages.map(toPackageKey))

  // report every package version only one side saw
  const disagreements: Disagreement[] = []
  for (const packageKey of handwrittenPackageKeys) {
    if (!oraclePackageKeys.has(packageKey)) {
      disagreements.push({
        lockfilePath,
        packageKey,
        kind: 'package-set',
        side: 'handwritten-only',
        advisoryIds: [],
      })
    }
  }
  for (const packageKey of oraclePackageKeys) {
    if (!handwrittenPackageKeys.has(packageKey)) {
      disagreements.push({
        lockfilePath,
        packageKey,
        kind: 'package-set',
        side: 'oracle-only',
        advisoryIds: [],
      })
    }
  }

  // compare the advisory groups of every package version both sides saw
  for (const packageKey of handwrittenPackageKeys) {
    if (!oraclePackageKeys.has(packageKey)) {
      continue
    }
    const advisorySetDisagreements = classifyAdvisoryGroups({
      lockfilePath,
      packageKey,
      handwrittenFindings,
      oracleMatches,
    })
    disagreements.push(...advisorySetDisagreements)
  }

  // order the disagreements by their row key
  return disagreements.sort((first, second) =>
    compareCodeUnitOrder({
      first: toDisagreementKey(first),
      second: toDisagreementKey(second),
    }),
  )
}

/** Returns the row key of a disagreement, the form the accepted table and the output use. */
export function toDisagreementKey({
  lockfilePath,
  packageKey,
  kind,
  side,
  advisoryIds,
}: Disagreement): string {
  const advisoryIdsCell = formatIdsCell(advisoryIds)
  return [lockfilePath, packageKey, kind, side, advisoryIdsCell].join(' | ')
}

/** Reads the keys of every row of the disagreements document whose ruling is accepted. */
export function readAcceptedDisagreementKeys(markdown: string): Set<string> {
  const acceptedKeys = new Set<string>()
  const lines = markdown.split('\n')
  for (const [i, line] of lines.entries()) {
    // read the cells of a table row, leaving out the separator and the header row above it
    const cells = readTableRowCells(line)
    if (cells === null || isSeparatorLine(lines[i + 1] ?? '')) {
      continue
    }

    // keep the key of an accepted row, whatever the case or emphasis of its ruling
    const ruling = normalizeRulingCell(cells[rulingColumnIndex] ?? '')
    if (ruling !== acceptedRuling) {
      continue
    }
    acceptedKeys.add(toRowKey(cells))
  }
  return acceptedKeys
}

// key a package version as its normalized name and version
function toPackageKey({ packageName, version }: ToPackageKeyOptions): string {
  return `${normalizePackageName(packageName)}@${version}`
}

// report every advisory group of one package version that the other side has no overlapping group for
function classifyAdvisoryGroups({
  lockfilePath,
  packageKey,
  handwrittenFindings,
  oracleMatches,
}: ClassifyAdvisoryGroupsOptions): Disagreement[] {
  // collect the id sets each side matched for this package version
  const handwrittenGroups = handwrittenFindings
    .filter((finding) => toPackageKey(finding) === packageKey)
    .map((finding) => sortAdvisoryIds([finding.advisoryId, ...finding.aliases]))
  const oracleGroups = oracleMatches
    .filter((oracleMatch) => toPackageKey(oracleMatch) === packageKey)
    .map((oracleMatch) => sortAdvisoryIds(oracleMatch.advisoryIds))

  // a group agrees when the other side has a group sharing any id
  const disagreements: Disagreement[] = []
  for (const handwrittenGroup of handwrittenGroups) {
    const hasOracleGroup = oracleGroups.some((oracleGroup) =>
      shareAnyId({ firstIds: handwrittenGroup, secondIds: oracleGroup }),
    )
    if (!hasOracleGroup) {
      disagreements.push({
        lockfilePath,
        packageKey,
        kind: 'advisory-set',
        side: 'handwritten-only',
        advisoryIds: handwrittenGroup,
      })
    }
  }
  for (const oracleGroup of oracleGroups) {
    const hasHandwrittenGroup = handwrittenGroups.some((handwrittenGroup) =>
      shareAnyId({ firstIds: handwrittenGroup, secondIds: oracleGroup }),
    )
    if (!hasHandwrittenGroup) {
      disagreements.push({
        lockfilePath,
        packageKey,
        kind: 'advisory-set',
        side: 'oracle-only',
        advisoryIds: oracleGroup,
      })
    }
  }
  return disagreements
}

// sort a copy of the ids in code unit order
function sortAdvisoryIds(advisoryIds: string[]): string[] {
  return [...advisoryIds].sort((first, second) =>
    compareCodeUnitOrder({ first, second }),
  )
}

// tell whether two id lists have an id in common
function shareAnyId({ firstIds, secondIds }: ShareAnyIdOptions): boolean {
  const secondIdSet = new Set(secondIds)
  return firstIds.some((advisoryId) => secondIdSet.has(advisoryId))
}

// write the ids cell of a key: the ids joined with a comma and a space, or a dash when there are none
function formatIdsCell(advisoryIds: string[]): string {
  return advisoryIds.length > 0 ? advisoryIds.join(', ') : '-'
}

// read the trimmed cells of a markdown table row with enough columns, or null for a separator or any other line
function readTableRowCells(line: string): string[] | null {
  // a row starts and ends with a pipe, and the separator row holds no cells
  const trimmedLine = line.trim()
  if (!trimmedLine.startsWith('|') || !trimmedLine.endsWith('|')) {
    return null
  }
  if (isSeparatorLine(trimmedLine)) {
    return null
  }

  // split the cells and strip the backticks the document wraps values in
  const rowBody = trimmedLine.slice(1, -1)
  const rawCells = rowBody.split('|')
  const cells = rawCells.map(stripCellMarkup)
  return cells.length > rulingColumnIndex ? cells : null
}

// tell whether a line is the separator row under a table header
function isSeparatorLine(line: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+$/.test(line.trim())
}

// strip the backticks around a cell value and the spaces around it
function stripCellMarkup(rawCell: string): string {
  const cellText = rawCell.replaceAll('`', '')
  return cellText.trim()
}

// read a ruling without its emphasis marks, spaces or case
function normalizeRulingCell(rulingCell: string): string {
  const rulingText = rulingCell.replace(/[*_]/g, '')
  return rulingText.trim().toLowerCase()
}

// build the key of a row from its first five cells, with the ids cell written the way toDisagreementKey prints it
function toRowKey(cells: string[]): string {
  const keyCells = cells.slice(0, keyColumnCount)
  keyCells[idsColumnIndex] = normalizeIdsCell(keyCells[idsColumnIndex] ?? '')
  return keyCells.join(' | ')
}

// read an ids cell whatever its spacing or order: split on commas, trim, drop empty ids and sort
function normalizeIdsCell(idsCell: string): string {
  if (idsCell === '-') {
    return idsCell
  }
  const rawIds = idsCell.split(',')
  const trimmedIds = rawIds.map((rawId) => rawId.trim())
  const advisoryIds = trimmedIds.filter((trimmedId) => trimmedId !== '')
  return formatIdsCell(sortAdvisoryIds(advisoryIds))
}
