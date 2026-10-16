// classifies a package as direct-imported, direct-unused or transitive from one import scan, the dependency set and the dependency graph
import type { DependencyGraph, DependencySet } from '@/shared/dependency'
import type { DependencyFinding } from '@/shared/finding'
import type { ImportsByPackage } from './collect-imports'

// the reachability fields of a dependency finding
export type ReachabilityClassification = Pick<
  DependencyFinding,
  'reachability' | 'importedBy' | 'dependencyPath'
>

// the package to classify, the head dependency set and graph, and the imports from one scan of the head checkout
export interface ClassifyReachabilityOptions {
  packageName: string
  dependencySet: DependencySet
  dependencyGraph: DependencyGraph
  imports: ImportsByPackage
}

/**
 * Classifies how the head checkout reaches a package, with the importing files and the shortest path from a direct dependency.
 */
export function classifyReachability({
  packageName,
  dependencySet,
  dependencyGraph,
  imports,
}: ClassifyReachabilityOptions): ReachabilityClassification {
  const importedBy = [...(imports.get(packageName) ?? [])]
  const dependencyPath = dependencyGraph.shortestPathTo(packageName)

  // a package any file imports is direct-imported, declared or not
  if (importedBy.length > 0) {
    return { reachability: 'direct-imported', importedBy, dependencyPath }
  }

  // a direct dependency no file imports is direct-unused
  if (dependencySet.directDependencyNames.has(packageName)) {
    return { reachability: 'direct-unused', importedBy: [], dependencyPath }
  }

  return { reachability: 'transitive', importedBy: [], dependencyPath }
}
