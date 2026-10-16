// the hand-written matcher: finds the advisories that cover every version in a dependency set and returns one finding per package version and alias group with a match audit
import type { Advisory, AdvisoryStore } from '@/shared/advisory'
import type {
  DependencyDiff,
  DependencySet,
  DependencyVersion,
} from '@/shared/dependency'
import type { Severity } from '@/shared/finding'
import { normalizePackageName } from '@/shared/package-name'
import { matchAffectedPackage, sortUniqueVersions } from './affected-range'
import {
  groupMatchedAdvisories,
  listGroupIds,
  type MatchedAdvisory,
  pickAdvisoryId,
} from './alias-group'
import {
  compareFindingOrder,
  type DependencyFinding,
  type MatchAudit,
  type MatchDependenciesResult,
} from './dependency-finding'

// the dependency set to match, the diff that says what the pull request introduced and the advisories to match against
export interface MatchDependenciesOptions {
  dependencySet: DependencySet
  dependencyDiff: DependencyDiff
  advisoryStore: AdvisoryStore
}

// the dependency version to match, the diff that says whether the pull request introduced it, the store to ask and the audit that counts what the lookup skips
interface MatchDependencyVersionFindingsOptions {
  dependencyVersion: DependencyVersion
  dependencyDiff: DependencyDiff
  advisoryStore: AdvisoryStore
  audit: MatchAudit
}

// the dependency version to look up, the store to ask and the audit that counts what the lookup skips
interface MatchDependencyVersionOptions {
  dependencyVersion: DependencyVersion
  advisoryStore: AdvisoryStore
  audit: MatchAudit
}

// one advisory to check against a version looked up under lookupName, and the audit that counts its ignored ranges
interface MatchAdvisoryOptions {
  advisory: Advisory
  lookupName: string
  version: string
  audit: MatchAudit
}

// the audit to note into, the advisory and looked-up name the notes name, and how many GIT ranges one entry skipped
interface NoteIgnoredGitRangesOptions {
  audit: MatchAudit
  advisoryId: string
  lookupName: string
  ignoredGitRangeCount: number
}

// the dependency version, the alias group that covers it and the diff that says whether the pull request introduced it
interface CreateDependencyFindingOptions {
  dependencyVersion: DependencyVersion
  aliasGroup: MatchedAdvisory[]
  dependencyDiff: DependencyDiff
}

// the dependency version and the diff to look it up in
interface IsIntroducedByPullRequestOptions {
  dependencyVersion: DependencyVersion
  dependencyDiff: DependencyDiff
}

// the ecosystem whose affected entries the matcher considers
const npmEcosystem = 'npm'

// the confidence of a finding whose severity comes from a CVSS score, and of one that fell back to medium
const scoredConfidence = 0.9
const unscoredConfidence = 0.5

/** Matches every dependency version of a set against the advisory store and returns one finding per package version and alias group with the match audit. */
export async function matchDependencies({
  dependencySet,
  dependencyDiff,
  advisoryStore,
}: MatchDependenciesOptions): Promise<MatchDependenciesResult> {
  // count every withdrawn advisory and ignored GIT range the lookups skip
  const audit: MatchAudit = {
    withdrawnAdvisoryCount: 0,
    ignoredGitRangeCount: 0,
    notes: [],
  }

  // collect the findings of every dependency version
  const findings: DependencyFinding[] = []
  for (const dependencyVersions of dependencySet.versionsByDependency.values()) {
    for (const dependencyVersion of dependencyVersions) {
      const versionFindings = await matchDependencyVersionFindings({
        dependencyVersion,
        dependencyDiff,
        advisoryStore,
        audit,
      })
      findings.push(...versionFindings)
    }
  }

  // return the findings in package name, version, advisory id and installed package name order
  findings.sort((firstFinding, secondFinding) =>
    compareFindingOrder({ firstFinding, secondFinding }),
  )
  return { findings, audit }
}

// match one dependency version and build one finding per alias group that covers it
async function matchDependencyVersionFindings({
  dependencyVersion,
  dependencyDiff,
  advisoryStore,
  audit,
}: MatchDependencyVersionFindingsOptions): Promise<DependencyFinding[]> {
  const matchedAdvisories = await matchDependencyVersion({
    dependencyVersion,
    advisoryStore,
    audit,
  })
  const aliasGroups = groupMatchedAdvisories(matchedAdvisories)
  return aliasGroups.map((aliasGroup) =>
    createDependencyFinding({ dependencyVersion, aliasGroup, dependencyDiff }),
  )
}

// look up one dependency version by its real package name and return every live advisory that covers it. a withdrawn advisory that covers it is counted and left out
async function matchDependencyVersion({
  dependencyVersion,
  advisoryStore,
  audit,
}: MatchDependencyVersionOptions): Promise<MatchedAdvisory[]> {
  // ask the store under the real package name of an alias
  const lookupName = dependencyVersion.realPackageName ?? dependencyVersion.name
  const storeAdvisories = await advisoryStore.getByPackage(lookupName)

  // keep the first entry of every advisory id the store returned
  const advisoriesById = new Map<string, Advisory>()
  for (const advisory of storeAdvisories) {
    if (!advisoriesById.has(advisory.id)) {
      advisoriesById.set(advisory.id, advisory)
    }
  }

  // check every advisory's entries, count a withdrawn one that covers the version and keep the live ones that do
  const matchedAdvisories: MatchedAdvisory[] = []
  for (const advisory of advisoriesById.values()) {
    const matchedAdvisory = matchAdvisory({
      advisory,
      lookupName,
      version: dependencyVersion.version,
      audit,
    })
    if (matchedAdvisory === undefined) {
      continue
    }
    if (advisory.withdrawn !== undefined) {
      audit.withdrawnAdvisoryCount += 1
      continue
    }
    matchedAdvisories.push(matchedAdvisory)
  }
  return matchedAdvisories
}

// check every npm entry of one advisory that names the looked-up package, and return the advisory when one covers the version
function matchAdvisory({
  advisory,
  lookupName,
  version,
  audit,
}: MatchAdvisoryOptions): MatchedAdvisory | undefined {
  // walk the entries whose ecosystem is npm and whose normalized name is the looked-up name
  const normalizedLookupName = normalizePackageName(lookupName)
  const matchedFixedVersions: string[] = []
  let isAdvisoryMatched = false
  for (const affectedPackage of advisory.affected) {
    if (affectedPackage.ecosystem !== npmEcosystem) {
      continue
    }
    if (normalizePackageName(affectedPackage.name) !== normalizedLookupName) {
      continue
    }

    // match the entry and note every GIT range it skipped. every walked entry is noted, and the notes repeat for every dependency version looked up
    const affectedPackageMatch = matchAffectedPackage({
      version,
      affectedPackage,
    })
    noteIgnoredGitRanges({
      audit,
      advisoryId: advisory.id,
      lookupName,
      ignoredGitRangeCount: affectedPackageMatch.ignoredGitRangeCount,
    })
    if (!affectedPackageMatch.isAffected) {
      continue
    }
    isAdvisoryMatched = true
    matchedFixedVersions.push(...affectedPackageMatch.fixedVersions)
  }

  // return the advisory only when an entry covered the version
  if (!isAdvisoryMatched) {
    return undefined
  }
  return { advisory, fixedVersions: matchedFixedVersions }
}

// count the GIT ranges one entry skipped and add one note per range
function noteIgnoredGitRanges({
  audit,
  advisoryId,
  lookupName,
  ignoredGitRangeCount,
}: NoteIgnoredGitRangesOptions): void {
  audit.ignoredGitRangeCount += ignoredGitRangeCount
  for (let i = 0; i < ignoredGitRangeCount; i++) {
    audit.notes.push(`ignored a GIT range of ${advisoryId} for ${lookupName}`)
  }
}

// build the finding of one alias group over one dependency version
function createDependencyFinding({
  dependencyVersion,
  aliasGroup,
  dependencyDiff,
}: CreateDependencyFindingOptions): DependencyFinding {
  // name the group by its GHSA id when it has one, else by its first id, and keep the other ids as aliases
  const groupIds = listGroupIds(aliasGroup)
  const advisoryId = pickAdvisoryId(groupIds)
  const aliases = groupIds.filter((groupId) => groupId !== advisoryId)

  // take the highest score, any review and the union of fixed versions over the group
  const cvssScore = findHighestScore(aliasGroup)
  const isGithubReviewed = aliasGroup.some(
    ({ advisory }) => advisory.isGithubReviewed,
  )
  const fixedVersions = sortUniqueVersions(
    aliasGroup.flatMap((matchedAdvisory) => matchedAdvisory.fixedVersions),
  )

  // include the score only when the group has one
  const dependencyFinding: DependencyFinding = {
    packageName: dependencyVersion.realPackageName ?? dependencyVersion.name,
    installedPackageName: dependencyVersion.name,
    version: dependencyVersion.version,
    advisoryId,
    aliases,
    severity: severityFromScore(cvssScore),
    confidence: cvssScore === undefined ? unscoredConfidence : scoredConfidence,
    isGithubReviewed,
    dependencyScope: dependencyVersion.scope,
    isVersionUnparseable: dependencyVersion.isVersionUnparseable,
    isIntroducedByPullRequest: isIntroducedByPullRequest({
      dependencyVersion,
      dependencyDiff,
    }),
    fixedVersions,
    matcherAgreement: 'oracle-unavailable',
  }
  if (cvssScore !== undefined) {
    dependencyFinding.cvssScore = cvssScore
  }
  return dependencyFinding
}

// find the highest severity score in the group, or undefined when no advisory has one
function findHighestScore(aliasGroup: MatchedAdvisory[]): number | undefined {
  let highestScore: number | undefined
  for (const { advisory } of aliasGroup) {
    if (advisory.severityScore === undefined) {
      continue
    }
    if (highestScore === undefined || advisory.severityScore > highestScore) {
      highestScore = advisory.severityScore
    }
  }
  return highestScore
}

// map a CVSS score to a severity: critical at 9, high at 7, medium at 4, else low. no score falls back to medium
function severityFromScore(cvssScore: number | undefined): Severity {
  if (cvssScore === undefined) {
    return 'medium'
  }
  if (cvssScore >= 9) {
    return 'critical'
  }
  if (cvssScore >= 7) {
    return 'high'
  }
  if (cvssScore >= 4) {
    return 'medium'
  }
  return 'low'
}

// decide whether the diff adds this version or changes the package to it
function isIntroducedByPullRequest({
  dependencyVersion,
  dependencyDiff,
}: IsIntroducedByPullRequestOptions): boolean {
  const { name, version } = dependencyVersion
  const isAdded = dependencyDiff.added.some(
    (addedVersion) =>
      addedVersion.name === name && addedVersion.version === version,
  )
  const isChangedTo = dependencyDiff.changed.some(
    (dependencyChange) =>
      dependencyChange.name === name && dependencyChange.toVersion === version,
  )
  return isAdded || isChangedTo
}
