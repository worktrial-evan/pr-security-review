// the types the matcher files share: the finding the hand-written matcher returns, its audit, what the oracle reports, and the order findings are sorted in
import type { DependencyScope } from '@/shared/dependency'
import type { MatcherAgreement, Severity } from '@/shared/finding'
import { compareCodeUnitOrder, compareVersionOrder } from './affected-range'

// one advisory alias group matched against one package version. packageName is the name the advisory is about and
// installedPackageName the name the lockfile installs it under, which differ only for an alias
export interface DependencyFinding {
  packageName: string
  installedPackageName: string
  version: string
  advisoryId: string
  aliases: string[]
  severity: Severity
  confidence: number
  cvssScore?: number
  isGithubReviewed: boolean
  dependencyScope: DependencyScope
  isVersionUnparseable: boolean
  isIntroducedByPullRequest: boolean
  fixedVersions: string[]
  matcherAgreement: MatcherAgreement
}

// what the hand-written matcher skipped: withdrawn advisories and GIT ranges, with one note per ignored range
export interface MatchAudit {
  withdrawnAdvisoryCount: number
  ignoredGitRangeCount: number
  notes: string[]
}

// the findings of one hand-written match and its audit
export interface MatchDependenciesResult {
  findings: DependencyFinding[]
  audit: MatchAudit
}

// one package version the oracle saw in the lockfile
export interface OraclePackage {
  packageName: string
  version: string
}

// one package version the oracle reported, with the sorted ids and aliases of one vulnerability group
export interface OracleMatch extends OraclePackage {
  advisoryIds: string[]
}

// the oracle ran and reported every package it saw and every match, or it could not run and says why
export type OracleResult =
  | { status: 'ran'; packages: OraclePackage[]; matches: OracleMatch[] }
  | { status: 'unavailable'; reason: string }

// the two findings to order
export interface CompareFindingOrderOptions {
  firstFinding: DependencyFinding
  secondFinding: DependencyFinding
}

/** Orders two findings by package name, then version, then advisory id, then installed package name. */
export function compareFindingOrder({
  firstFinding,
  secondFinding,
}: CompareFindingOrderOptions): number {
  const packageNameOrder = compareCodeUnitOrder({
    first: firstFinding.packageName,
    second: secondFinding.packageName,
  })
  if (packageNameOrder !== 0) {
    return packageNameOrder
  }
  const versionOrder = compareVersionOrder({
    first: firstFinding.version,
    second: secondFinding.version,
  })
  if (versionOrder !== 0) {
    return versionOrder
  }
  const advisoryIdOrder = compareCodeUnitOrder({
    first: firstFinding.advisoryId,
    second: secondFinding.advisoryId,
  })
  if (advisoryIdOrder !== 0) {
    return advisoryIdOrder
  }
  return compareCodeUnitOrder({
    first: firstFinding.installedPackageName,
    second: secondFinding.installedPackageName,
  })
}
