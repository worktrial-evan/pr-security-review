// the dedupe-findings step: drops repeated findings and code-review findings another detector already reports
import { posix } from 'node:path'
import {
  lockfileKindsByFileName,
  unsupportedLockfileFileNames,
} from '@/lockfile/lockfile-registry'
import type {
  CodeReviewFinding,
  Finding,
  ScaFinding,
  SecretFinding,
} from '@/shared/finding'

// why a finding was dropped
export const dedupeReasons = [
  'duplicate-id',
  'same-dependency-in-another-lockfile',
  'covered-by-dependency-finding',
  'covered-by-secret-finding',
] as const
export type DedupeReason = (typeof dedupeReasons)[number]

// a dropped finding and why
export interface DroppedFinding {
  finding: Finding
  reason: DedupeReason
}

// the findings kept in input order and the ones dropped
export interface DedupedFindings {
  keptFindings: Finding[]
  droppedFindings: DroppedFinding[]
}

// the hardcoded credential weaknesses a secrets finding already covers
export const hardcodedCredentialCwes = [
  'CWE-798',
  'CWE-259',
  'CWE-321',
] as const

// the file names a dependency bump is made in
const dependencyFileNames = new Set<string>([
  'package.json',
  ...Object.keys(lockfileKindsByFileName),
  ...unsupportedLockfileFileNames,
])

/**
 * Drops repeated ids and a vulnerable version a second lockfile repeats. Also drops code-review findings another detector already reports.
 */
export function dedupeFindings(findings: Finding[]): DedupedFindings {
  // index what the dependency and secrets detectors already report
  const scaFindings = findings.filter(
    (finding): finding is ScaFinding => finding.detector === 'sca',
  )
  const secretFindings = findings.filter(
    (finding): finding is SecretFinding => finding.detector === 'secrets',
  )
  const dependencyPackageNames = new Set(
    scaFindings.map((scaFinding) => scaFinding.packageName),
  )

  // keep each finding unless a rule drops it
  const keptFindings: Finding[] = []
  const droppedFindings: DroppedFinding[] = []
  const seenFindingIds = new Set<string>()
  const seenDependencyKeys = new Set<string>()
  for (const finding of findings) {
    const reason = findDedupeReason({
      finding,
      seenFindingIds,
      seenDependencyKeys,
      dependencyPackageNames,
      secretFindings,
    })
    if (reason === undefined) {
      keptFindings.push(finding)
    } else {
      droppedFindings.push({ finding, reason })
    }
    seenFindingIds.add(finding.id)
    if (finding.detector === 'sca') {
      seenDependencyKeys.add(toDependencyKey(finding))
    }
  }

  return { keptFindings, droppedFindings }
}

// one finding and what the other detectors report
interface FindDedupeReasonOptions {
  finding: Finding
  seenFindingIds: Set<string>
  seenDependencyKeys: Set<string>
  dependencyPackageNames: Set<string>
  secretFindings: SecretFinding[]
}

// say why a finding is dropped. return undefined to keep it
function findDedupeReason({
  finding,
  seenFindingIds,
  seenDependencyKeys,
  dependencyPackageNames,
  secretFindings,
}: FindDedupeReasonOptions): DedupeReason | undefined {
  // a repeated id is the same finding twice
  if (seenFindingIds.has(finding.id)) {
    return 'duplicate-id'
  }

  // the same vulnerable version in a second lockfile is the same problem
  if (finding.detector === 'sca') {
    return seenDependencyKeys.has(toDependencyKey(finding))
      ? 'same-dependency-in-another-lockfile'
      : undefined
  }
  if (finding.detector !== 'code-review') {
    return undefined
  }

  // a code-review finding on a dependency bump the dependency detector reports
  if (isCoveredByDependencyFinding({ finding, dependencyPackageNames })) {
    return 'covered-by-dependency-finding'
  }

  // a hardcoded credential on a line the secrets detector reports
  if (isCoveredBySecretFinding({ finding, secretFindings })) {
    return 'covered-by-secret-finding'
  }
  return undefined
}

// the package and version and advisory that make two dependency findings the same problem
function toDependencyKey(scaFinding: ScaFinding): string {
  return [
    scaFinding.packageName,
    scaFinding.version,
    scaFinding.advisoryId,
  ].join('\n')
}

// a code-review finding and the packages the dependency detector reports
interface IsCoveredByDependencyFindingOptions {
  finding: CodeReviewFinding
  dependencyPackageNames: Set<string>
}

// whether a code-review finding in a manifest or lockfile names a package a dependency finding reports
function isCoveredByDependencyFinding({
  finding,
  dependencyPackageNames,
}: IsCoveredByDependencyFindingOptions): boolean {
  // only a finding in a dependency file can be about a bump
  const fileName = posix.basename(finding.file ?? '')
  if (!dependencyFileNames.has(fileName)) {
    return false
  }

  // look for a reported package name in what the finding says
  const findingText = [
    finding.title,
    finding.sourceToSink,
    ...finding.evidence,
  ].join('\n')
  return [...dependencyPackageNames].some((packageName) =>
    mentionsPackageName({ text: findingText, packageName }),
  )
}

// a text and a package name to look for
interface MentionsPackageNameOptions {
  text: string
  packageName: string
}

// whether the package name appears in the text with no name character on either side
function mentionsPackageName({
  text,
  packageName,
}: MentionsPackageNameOptions): boolean {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const namePattern = new RegExp(`(^|[^\\w@/.-])${escapedName}($|[^\\w/.-])`)
  return namePattern.test(text)
}

// a code-review finding and the secrets findings to compare it with
interface IsCoveredBySecretFindingOptions {
  finding: CodeReviewFinding
  secretFindings: SecretFinding[]
}

// whether a hardcoded credential finding overlaps a secrets finding in the same file
function isCoveredBySecretFinding({
  finding,
  secretFindings,
}: IsCoveredBySecretFindingOptions): boolean {
  // only a hardcoded credential weakness is a secret in other words
  const isCredentialCwe = (
    hardcodedCredentialCwes as readonly string[]
  ).includes(finding.cwe.toUpperCase())
  if (!isCredentialCwe || finding.file === undefined) {
    return false
  }

  // compare line ranges in the same file. a finding without lines covers the whole file
  const findingStartLine = finding.startLine ?? 1
  const findingEndLine =
    finding.endLine ?? finding.startLine ?? Number.POSITIVE_INFINITY
  return secretFindings.some((secretFinding) => {
    const secretLine = secretFinding.startLine ?? 0
    return (
      secretFinding.file === finding.file &&
      secretLine >= findingStartLine &&
      secretLine <= findingEndLine
    )
  })
}
