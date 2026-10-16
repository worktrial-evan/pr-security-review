// the match-dependencies step. it matches each changed lockfile with the hand-written matcher and cross-checks it with osv-scanner
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  DependencyFinding,
  OracleResult,
} from '@/matcher/dependency-finding'
import { matchDependencies } from '@/matcher/match'
import {
  type RunOracleOptions,
  runOracle as runOsvScanner,
  writeOracleDatabase,
} from '@/matcher/oracle'
import { reconcileMatches } from '@/matcher/reconcile'
import type { Advisory, AdvisoryStore } from '@/shared/advisory'
import type { PullRequestSource } from '@/shared/pull-request-source'
import type { LockfileChange } from './lockfile-step'
import { type RunRecord, writeRunNote } from './run-record'

// the findings matched in one changed lockfile
export interface LockfileMatches {
  lockfileChange: LockfileChange
  dependencyFindings: DependencyFinding[]
}

// the changed lockfiles and the store to match them against. the store is absent when it was not loaded
export interface MatchDependenciesOptions {
  lockfileChanges: LockfileChange[]
  advisoryStore: AdvisoryStore | undefined
  pullRequestSource: PullRequestSource
  runRecord: RunRecord
}

// the findings per lockfile and the reasons the step ran degraded
export interface DependencyMatching {
  lockfileMatches: LockfileMatches[]
  degradedReasons: string[]
}

// a function that matches changed lockfiles against advisories
export type MatchDependencies = (
  options: MatchDependenciesOptions,
) => Promise<DependencyMatching>

// a function that runs the oracle over one lockfile. tests replace osv-scanner with it
export type RunOracle = (options: RunOracleOptions) => Promise<OracleResult>

// the oracle the matcher cross-checks with
export interface CreateLockfileMatcherOptions {
  runOracle?: RunOracle
}

/**
 * Creates the matcher the pipeline runs. It matches every changed lockfile at head and reconciles the result with the oracle.
 */
export function createLockfileMatcher({
  runOracle = runOsvScanner,
}: CreateLockfileMatcherOptions = {}): MatchDependencies {
  return async ({
    lockfileChanges,
    advisoryStore,
    pullRequestSource,
    runRecord,
  }) => {
    // nothing to match without a changed lockfile. a changed lockfile without a store degrades the step
    if (lockfileChanges.length === 0) {
      return { lockfileMatches: [], degradedReasons: [] }
    }
    if (advisoryStore === undefined) {
      return {
        lockfileMatches: [],
        degradedReasons: ['no advisory store was loaded'],
      }
    }

    // match each lockfile against the head checkout the oracle reads
    const headDirectory = await pullRequestSource.checkoutHead()
    const dependencyMatching: DependencyMatching = {
      lockfileMatches: [],
      degradedReasons: [],
    }
    for (const lockfileChange of lockfileChanges) {
      const lockfileMatching = await matchLockfileChange({
        lockfileChange,
        advisoryStore,
        headDirectory,
        runOracle,
        runRecord,
      })
      dependencyMatching.lockfileMatches.push(lockfileMatching.lockfileMatches)
      dependencyMatching.degradedReasons.push(
        ...lockfileMatching.degradedReasons,
      )
    }
    return dependencyMatching
  }
}

// one lockfile to match and what matching it needs
interface MatchLockfileChangeOptions {
  lockfileChange: LockfileChange
  advisoryStore: AdvisoryStore
  headDirectory: string
  runOracle: RunOracle
  runRecord: RunRecord
}

// the findings of one lockfile and the reasons its match ran degraded
interface LockfileMatching {
  lockfileMatches: LockfileMatches
  degradedReasons: string[]
}

// match one lockfile by hand. then cross-check it with the oracle and reconcile the two
async function matchLockfileChange({
  lockfileChange,
  advisoryStore,
  headDirectory,
  runOracle,
  runRecord,
}: MatchLockfileChangeOptions): Promise<LockfileMatching> {
  // match the head set and note what the matcher skipped
  const { lockfilePath, headDependencySet, dependencyDiff } = lockfileChange
  const matchDependenciesResult = await matchDependencies({
    dependencySet: headDependencySet,
    dependencyDiff,
    advisoryStore,
  })
  const { audit } = matchDependenciesResult

  // set aside a finding whose advisory already affected the package at base
  const baseAdvisoryIdsByPackage = await collectBaseAdvisoryIds({
    lockfileChange,
    advisoryStore,
  })
  const handwrittenFindings = matchDependenciesResult.findings.map(
    (dependencyFinding) =>
      markPreExistingAtBase({ dependencyFinding, baseAdvisoryIdsByPackage }),
  )

  // cross-check with the oracle and keep the union of both
  const oracleResult = await crossCheckWithOracle({
    lockfileChange,
    advisoryStore,
    headDirectory,
    runOracle,
  })
  const dependencyFindings = reconcileMatches({
    handwrittenFindings,
    oracleResult,
  })
  await writeRunNote({
    runRecord,
    step: 'match-dependencies',
    payload: {
      message: 'lockfile matched',
      lockfilePath,
      findingCount: dependencyFindings.length,
      withdrawnAdvisoryCount: audit.withdrawnAdvisoryCount,
      ignoredGitRangeCount: audit.ignoredGitRangeCount,
      notes: audit.notes,
      oracleStatus: oracleResult.status,
    },
  })

  // degrade the step when the oracle could not check this lockfile
  const degradedReasons =
    oracleResult.status === 'unavailable'
      ? [
          `osv-scanner cross-check skipped for ${lockfilePath}: ${oracleResult.reason}`,
        ]
      : []
  return {
    lockfileMatches: { lockfileChange, dependencyFindings },
    degradedReasons,
  }
}

// the lockfile whose base set to match and the store to ask
interface CollectBaseAdvisoryIdsOptions {
  lockfileChange: LockfileChange
  advisoryStore: AdvisoryStore
}

// match the base set and collect every advisory id and alias that already affected each installed package
async function collectBaseAdvisoryIds({
  lockfileChange,
  advisoryStore,
}: CollectBaseAdvisoryIdsOptions): Promise<Map<string, Set<string>>> {
  // match the base set on its own. nothing at base is introduced
  const baseMatchResult = await matchDependencies({
    dependencySet: lockfileChange.baseDependencySet,
    dependencyDiff: { added: [], removed: [], changed: [], unchangedCount: 0 },
    advisoryStore,
  })

  // gather the ids of each package's findings
  const baseAdvisoryIdsByPackage = new Map<string, Set<string>>()
  for (const baseFinding of baseMatchResult.findings) {
    const packageAdvisoryIds =
      baseAdvisoryIdsByPackage.get(baseFinding.installedPackageName) ??
      new Set<string>()
    for (const advisoryId of [baseFinding.advisoryId, ...baseFinding.aliases]) {
      packageAdvisoryIds.add(advisoryId)
    }
    baseAdvisoryIdsByPackage.set(
      baseFinding.installedPackageName,
      packageAdvisoryIds,
    )
  }
  return baseAdvisoryIdsByPackage
}

// a head finding and the advisory ids that affected each package at base
interface MarkPreExistingAtBaseOptions {
  dependencyFinding: DependencyFinding
  baseAdvisoryIdsByPackage: Map<string, Set<string>>
}

// mark a finding pre-existing when the base already had its advisory or an alias of it for the same package
function markPreExistingAtBase({
  dependencyFinding,
  baseAdvisoryIdsByPackage,
}: MarkPreExistingAtBaseOptions): DependencyFinding {
  const baseAdvisoryIds = baseAdvisoryIdsByPackage.get(
    dependencyFinding.installedPackageName,
  )
  if (baseAdvisoryIds === undefined) {
    return dependencyFinding
  }
  const findingAdvisoryIds = [
    dependencyFinding.advisoryId,
    ...dependencyFinding.aliases,
  ]
  const isAtBase = findingAdvisoryIds.some((advisoryId) =>
    baseAdvisoryIds.has(advisoryId),
  )
  return isAtBase
    ? { ...dependencyFinding, isIntroducedByPullRequest: false }
    : dependencyFinding
}

// one lockfile and what the oracle needs to scan it
interface CrossCheckWithOracleOptions {
  lockfileChange: LockfileChange
  advisoryStore: AdvisoryStore
  headDirectory: string
  runOracle: RunOracle
}

// write the advisories of every installed package into a temporary oracle database and scan the head lockfile with it
async function crossCheckWithOracle({
  lockfileChange,
  advisoryStore,
  headDirectory,
  runOracle,
}: CrossCheckWithOracleOptions): Promise<OracleResult> {
  const advisories = await collectInstalledAdvisories({
    lockfileChange,
    advisoryStore,
  })
  const databaseDir = await mkdtemp(
    join(tmpdir(), 'pull-request-review-oracle-'),
  )
  try {
    await writeOracleDatabase({ advisories, databaseDir })
    return await runOracle({
      lockfilePath: join(headDirectory, lockfileChange.lockfilePath),
      databaseDir,
    })
  } finally {
    await rm(databaseDir, { recursive: true, force: true })
  }
}

// the lockfile whose packages to look up and the store to ask
interface CollectInstalledAdvisoriesOptions {
  lockfileChange: LockfileChange
  advisoryStore: AdvisoryStore
}

// ask the store for the advisories of every package the head lockfile installs. an alias is asked under its real name too
async function collectInstalledAdvisories({
  lockfileChange,
  advisoryStore,
}: CollectInstalledAdvisoriesOptions): Promise<Advisory[]> {
  // name every installed package and the real package behind each alias
  const packageNames = new Set<string>()
  for (const [packageName, dependencyVersions] of lockfileChange
    .headDependencySet.versionsByDependency) {
    packageNames.add(packageName)
    for (const dependencyVersion of dependencyVersions) {
      if (dependencyVersion.realPackageName !== undefined) {
        packageNames.add(dependencyVersion.realPackageName)
      }
    }
  }

  // look each name up once
  const advisories: Advisory[] = []
  for (const packageName of packageNames) {
    advisories.push(...(await advisoryStore.getByPackage(packageName)))
  }
  return advisories
}
