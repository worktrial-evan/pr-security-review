// reconciles the hand-written matcher's findings with the oracle's matches into one sorted list, with an agreement on
// every finding and one oracle-only finding per distinct oracle match
import type { MatcherAgreement } from '@/shared/finding'
import { normalizePackageName } from '@/shared/package-name'
import { compareCodeUnitOrder, isVersionUnparseable } from './affected-range'
import { pickAdvisoryId } from './alias-group'
import {
  compareFindingOrder,
  type DependencyFinding,
  type OracleMatch,
  type OracleResult,
} from './dependency-finding'

// the hand-written findings and the oracle result to reconcile
export interface ReconcileMatchesOptions {
  handwrittenFindings: DependencyFinding[]
  oracleResult: OracleResult
}

// the hand-written findings and the oracle matches with ids to turn into oracle-only findings
interface ListOracleOnlyFindingsOptions {
  handwrittenFindings: DependencyFinding[]
  oracleMatches: OracleMatch[]
}

/** Returns the sorted union of the hand-written findings and the oracle matches, each marked with which matchers reported it. */
export function reconcileMatches({
  handwrittenFindings,
  oracleResult,
}: ReconcileMatchesOptions): DependencyFinding[] {
  // mark every hand-written finding oracle-unavailable when the oracle did not run
  if (oracleResult.status === 'unavailable') {
    const unavailableFindings = handwrittenFindings.map((handwrittenFinding) =>
      copyFindingWithAgreement(handwrittenFinding, 'oracle-unavailable'),
    )
    return sortFindings(unavailableFindings)
  }

  // skip every oracle match that names no advisory id
  const oracleMatches = oracleResult.matches.filter(
    (oracleMatch) => oracleMatch.advisoryIds.length > 0,
  )

  // mark each hand-written finding by whether an oracle match agrees with it
  const markedHandwrittenFindings = handwrittenFindings.map(
    (handwrittenFinding) => {
      const hasAgreeingMatch = oracleMatches.some((oracleMatch) =>
        isOracleMatchAgreeing(handwrittenFinding, oracleMatch),
      )
      const matcherAgreement = hasAgreeingMatch ? 'both' : 'handwritten-only'
      return copyFindingWithAgreement(handwrittenFinding, matcherAgreement)
    },
  )

  // turn every oracle match that no hand-written finding agrees with into an oracle-only finding
  const oracleOnlyFindings = listOracleOnlyFindings({
    handwrittenFindings,
    oracleMatches,
  })

  // return the union in finding order
  return sortFindings([...markedHandwrittenFindings, ...oracleOnlyFindings])
}

// copy a finding with its arrays and set its agreement
function copyFindingWithAgreement(
  dependencyFinding: DependencyFinding,
  matcherAgreement: MatcherAgreement,
): DependencyFinding {
  return {
    ...dependencyFinding,
    aliases: [...dependencyFinding.aliases],
    fixedVersions: [...dependencyFinding.fixedVersions],
    matcherAgreement,
  }
}

// sort the findings in place into finding order
function sortFindings(
  dependencyFindings: DependencyFinding[],
): DependencyFinding[] {
  return dependencyFindings.sort((firstFinding, secondFinding) =>
    compareFindingOrder({ firstFinding, secondFinding }),
  )
}

// a hand-written finding and an oracle match agree when they name the same package version and share at least one id
function isOracleMatchAgreeing(
  dependencyFinding: DependencyFinding,
  oracleMatch: OracleMatch,
): boolean {
  // compare the package names through the one npm name rule
  const isSamePackage =
    normalizePackageName(dependencyFinding.packageName) ===
    normalizePackageName(oracleMatch.packageName)
  if (!isSamePackage) {
    return false
  }
  if (dependencyFinding.version !== oracleMatch.version) {
    return false
  }

  // share an id when the finding's advisory id or any alias is among the oracle's ids
  const findingAdvisoryIds = [
    dependencyFinding.advisoryId,
    ...dependencyFinding.aliases,
  ]
  return findingAdvisoryIds.some((findingAdvisoryId) =>
    oracleMatch.advisoryIds.includes(findingAdvisoryId),
  )
}

// build one oracle-only finding per distinct oracle match that no hand-written finding agrees with
function listOracleOnlyFindings({
  handwrittenFindings,
  oracleMatches,
}: ListOracleOnlyFindingsOptions): DependencyFinding[] {
  // keep the matches that no hand-written finding agrees with
  const oracleOnlyMatches = oracleMatches.filter(
    (oracleMatch) =>
      !handwrittenFindings.some((handwrittenFinding) =>
        isOracleMatchAgreeing(handwrittenFinding, oracleMatch),
      ),
  )

  // keep the first match of every package name, version and sorted id set
  const uniqueOracleOnlyMatches = listUniqueOracleMatches(oracleOnlyMatches)
  return uniqueOracleOnlyMatches.map(createOracleOnlyFinding)
}

// keep the first match of every match key
function listUniqueOracleMatches(oracleMatches: OracleMatch[]): OracleMatch[] {
  const oracleMatchesByKey = new Map<string, OracleMatch>()
  for (const oracleMatch of oracleMatches) {
    const oracleMatchKey = toOracleMatchKey(oracleMatch)
    if (!oracleMatchesByKey.has(oracleMatchKey)) {
      oracleMatchesByKey.set(oracleMatchKey, oracleMatch)
    }
  }
  return [...oracleMatchesByKey.values()]
}

// the key of a match: package name, version, then the sorted ids
function toOracleMatchKey(oracleMatch: OracleMatch): string {
  const sortedAdvisoryIds = sortAdvisoryIds(oracleMatch.advisoryIds)
  return `${oracleMatch.packageName}\n${oracleMatch.version}\n${sortedAdvisoryIds.join(',')}`
}

// a copy of the ids in code unit order
function sortAdvisoryIds(advisoryIds: string[]): string[] {
  return [...advisoryIds].sort((first, second) =>
    compareCodeUnitOrder({ first, second }),
  )
}

// build a finding from an oracle match alone, with the defaults of a finding that matched no advisory
function createOracleOnlyFinding(oracleMatch: OracleMatch): DependencyFinding {
  // sort the ids into code unit order. the oracle's own order does not decide the pick or the aliases
  const sortedAdvisoryIds = sortAdvisoryIds(oracleMatch.advisoryIds)

  // name the finding after the group's advisory id and keep the rest as aliases
  const advisoryId = pickAdvisoryId(sortedAdvisoryIds)
  const aliases = sortedAdvisoryIds.filter(
    (sortedAdvisoryId) => sortedAdvisoryId !== advisoryId,
  )

  return {
    packageName: oracleMatch.packageName,
    installedPackageName: oracleMatch.packageName,
    version: oracleMatch.version,
    advisoryId,
    aliases,
    severity: 'medium',
    confidence: 0.5,
    isGithubReviewed: false,
    dependencyScope: 'prod',
    isVersionUnparseable: isVersionUnparseable(oracleMatch.version),
    isIntroducedByPullRequest: false,
    fixedVersions: [],
    matcherAgreement: 'oracle-only',
  }
}
