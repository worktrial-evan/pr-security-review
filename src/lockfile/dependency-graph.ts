// builds the dependency graph of one dependency set and finds the shortest chain from a direct dependency to a package by breadth-first search
import type {
  DependencyGraph,
  DependencySet,
  DependencyVersion,
} from '@/shared/dependency'
import { toDependencyKey } from './dependency-set'
import { toSortedDependencyVersions } from './sorted-dependency-versions'

/** Builds a DependencyGraph whose shortestPathTo walks from the direct dependencies, matching a package by name or real package name. */
export function buildDependencyGraph(
  dependencySet: DependencySet,
): DependencyGraph {
  // index every version by its name@version key, in sorted order
  const sortedDependencyVersions = toSortedDependencyVersions(dependencySet)
  const versionsByKey = new Map(
    sortedDependencyVersions.map((dependencyVersion) => [
      toDependencyKey(dependencyVersion),
      dependencyVersion,
    ]),
  )

  // start every search from the direct versions in sorted order
  const directVersions = sortedDependencyVersions.filter(
    (dependencyVersion) => dependencyVersion.isDirect,
  )
  const directKeys = directVersions.map(toDependencyKey)
  return {
    shortestPathTo: (dependencyName: string): string[] =>
      findShortestPath({ dependencyName, versionsByKey, directKeys }),
  }
}

// the package to find, every version by key and the keys to start from
interface FindShortestPathOptions {
  dependencyName: string
  versionsByKey: Map<string, DependencyVersion>
  directKeys: string[]
}

// walk breadth first from the direct keys and return the chain to the first version that matches. nothing reached gives an empty chain
function findShortestPath({
  dependencyName,
  versionsByKey,
  directKeys,
}: FindShortestPathOptions): string[] {
  const previousKeyByKey = new Map<string, string | null>(
    directKeys.map((directKey) => [directKey, null]),
  )
  const pendingKeys = [...directKeys]
  for (let i = 0; i < pendingKeys.length; i++) {
    // stop at the first version that matches by name or real package name
    const dependencyKey = pendingKeys[i] ?? ''
    const dependencyVersion = versionsByKey.get(dependencyKey)
    if (!dependencyVersion) {
      continue
    }
    if (
      dependencyVersion.name === dependencyName ||
      dependencyVersion.realPackageName === dependencyName
    ) {
      return tracePath({ dependencyKey, previousKeyByKey })
    }

    // queue each dependency the first time it is reached
    const unvisitedKeys = dependencyVersion.dependencyKeys.filter(
      (nextKey) => !previousKeyByKey.has(nextKey),
    )
    for (const unvisitedKey of unvisitedKeys) {
      previousKeyByKey.set(unvisitedKey, dependencyKey)
      pendingKeys.push(unvisitedKey)
    }
  }
  return []
}

// the key that was found and the key each key was first reached from
interface TracePathOptions {
  dependencyKey: string
  previousKeyByKey: Map<string, string | null>
}

// follow the reached-from links back to a direct key and return the chain from the direct key down
function tracePath({
  dependencyKey,
  previousKeyByKey,
}: TracePathOptions): string[] {
  const reversedPath: string[] = []
  let currentKey: string | null | undefined = dependencyKey
  while (currentKey) {
    reversedPath.push(currentKey)
    currentKey = previousKeyByKey.get(currentKey)
  }
  return reversedPath.reverse()
}
