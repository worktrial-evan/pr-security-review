// the reachability step. it scans the head checkout's imports once and turns each matcher finding into a dependency finding
import { buildDependencyGraph } from '@/lockfile/dependency-graph'
import type { DependencyFinding as MatchedDependency } from '@/matcher/dependency-finding'
import {
  classifyReachability,
  type ReachabilityClassification,
} from '@/reachability/classify-reachability'
import { collectImports } from '@/reachability/collect-imports'
import type { AuditSink } from '@/shared/audit'
import { createFindingId, type DependencyFinding } from '@/shared/finding'
import type { PullRequestSource } from '@/shared/pull-request-source'
import type { LockfileMatches } from './matching-step'

// the matches to classify and the source whose head is scanned. also the audit context of the scan
export interface ClassifyDependencyFindingsOptions {
  lockfileMatches: LockfileMatches[]
  pullRequestSource: PullRequestSource
  auditSink: AuditSink
  runId: string
}

/**
 * Classifies the reachability of every dependency match and returns them as dependency findings. Nothing is scanned when there are no matches.
 */
export async function classifyDependencyFindings({
  lockfileMatches,
  pullRequestSource,
  auditSink,
  runId,
}: ClassifyDependencyFindingsOptions): Promise<DependencyFinding[]> {
  // skip the checkout and the scan when nothing matched
  const findingCount = lockfileMatches.reduce(
    (count, lockfileMatch) => count + lockfileMatch.dependencyFindings.length,
    0,
  )
  if (findingCount === 0) {
    return []
  }

  // collect the imports of the head checkout once
  const headDirectory = await pullRequestSource.checkoutHead()
  const importCollection = await collectImports({
    rootDirectory: headDirectory,
    auditSink,
    runId,
  })

  // classify every match against its own lockfile's dependency graph
  const dependencyFindings: DependencyFinding[] = []
  for (const {
    lockfileChange,
    dependencyFindings: matches,
  } of lockfileMatches) {
    const dependencySet = lockfileChange.headDependencySet
    const dependencyGraph = buildDependencyGraph(dependencySet)
    for (const match of matches) {
      const reachabilityClassification = classifyReachability({
        packageName: match.installedPackageName,
        dependencySet,
        dependencyGraph,
        imports: importCollection.imports,
      })
      dependencyFindings.push(
        toDependencyFinding({
          dependencyFinding: match,
          lockfilePath: lockfileChange.lockfilePath,
          reachabilityClassification,
        }),
      )
    }
  }
  return dependencyFindings
}

// one match with the lockfile it was found in and its reachability
export interface ToDependencyFindingOptions {
  dependencyFinding: MatchedDependency
  lockfilePath: string
  reachabilityClassification: ReachabilityClassification
}

/**
 * Builds the dependency finding of a dependency match, with an id derived from the lockfile, package, version and advisory.
 */
export function toDependencyFinding({
  dependencyFinding,
  lockfilePath,
  reachabilityClassification,
}: ToDependencyFindingOptions): DependencyFinding {
  // derive a stable id from where and what the match is
  const { installedPackageName, ...matchFields } = dependencyFinding
  const stableKey = [
    lockfilePath,
    installedPackageName,
    dependencyFinding.version,
    dependencyFinding.advisoryId,
  ].join('\n')

  return {
    ...matchFields,
    ...reachabilityClassification,
    id: createFindingId({ detector: 'dependency', stableKey }),
    detector: 'dependency',
    title: `${dependencyFinding.packageName}@${dependencyFinding.version} is affected by ${dependencyFinding.advisoryId}`,
    file: lockfilePath,
  }
}
