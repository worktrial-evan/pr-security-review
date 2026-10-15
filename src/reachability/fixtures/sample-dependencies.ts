// the dependency set and dependency graph of the sample repository, with an unused direct dependency and a transitive one
import type {
  DependencyGraph,
  DependencySet,
  DependencyVersion,
} from '@/shared/dependency'

// the options that differ between the fixture versions
interface FixtureVersionOptions {
  name: string
  version: string
  isDirect: boolean
  dependencyKeys?: string[]
}

// the resolved versions of the sample repository. deep-transitive is reached through two routes of different length
const sampleDependencyVersions: DependencyVersion[] = [
  toFixtureVersion({
    name: 'lodash',
    version: '4.17.21',
    isDirect: true,
    dependencyKeys: ['deep-transitive@0.1.0'],
  }),
  toFixtureVersion({
    name: '@acme/logger',
    version: '2.0.0',
    isDirect: true,
    dependencyKeys: ['chalk-lite@1.0.0'],
  }),
  toFixtureVersion({
    name: 'chalk-lite',
    version: '1.0.0',
    isDirect: false,
    dependencyKeys: ['deep-transitive@0.1.0'],
  }),
  toFixtureVersion({
    name: 'deep-transitive',
    version: '0.1.0',
    isDirect: false,
  }),
  toFixtureVersion({ name: 'left-pad', version: '1.3.0', isDirect: true }),
  toFixtureVersion({ name: 'unused-direct', version: '3.0.0', isDirect: true }),
]

/**
 * Builds the dependency set of the sample repository.
 */
export function buildSampleDependencySet(): DependencySet {
  // group the versions by package name
  const versionsByDependency = new Map<string, DependencyVersion[]>()
  for (const dependencyVersion of sampleDependencyVersions) {
    const packageVersions =
      versionsByDependency.get(dependencyVersion.name) ?? []
    packageVersions.push(dependencyVersion)
    versionsByDependency.set(dependencyVersion.name, packageVersions)
  }

  // collect the direct dependency names
  const directVersions = sampleDependencyVersions.filter(
    (dependencyVersion) => dependencyVersion.isDirect,
  )
  const directDependencyNames = new Set(
    directVersions.map((dependencyVersion) => dependencyVersion.name),
  )

  return {
    lockfileKind: 'bun',
    lockfilePath: 'bun.lock',
    versionsByDependency,
    directDependencyNames,
  }
}

/**
 * Builds a breadth-first dependency graph over the sample versions.
 */
export function buildSampleDependencyGraph(): DependencyGraph {
  // index every version by its name@version key
  const versionsByKey = new Map(
    sampleDependencyVersions.map((dependencyVersion) => [
      toDependencyKey(dependencyVersion),
      dependencyVersion,
    ]),
  )
  const directKeys = sampleDependencyVersions
    .filter((dependencyVersion) => dependencyVersion.isDirect)
    .map(toDependencyKey)

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

// walk breadth first from the direct dependencies and return the first path that ends at the package
function findShortestPath({
  dependencyName,
  versionsByKey,
  directKeys,
}: FindShortestPathOptions): string[] {
  const pendingPaths = directKeys.map((directKey) => [directKey])
  const visitedKeys = new Set(directKeys)

  // take paths in order of length so the first match is the shortest
  for (const pendingPath of pendingPaths) {
    const lastKey = pendingPath.at(-1) ?? ''
    const lastVersion = versionsByKey.get(lastKey)
    if (lastVersion?.name === dependencyName) {
      return pendingPath
    }

    // queue every dependency not seen yet
    const nextKeys = lastVersion?.dependencyKeys ?? []
    for (const nextKey of nextKeys) {
      if (visitedKeys.has(nextKey)) {
        continue
      }
      visitedKeys.add(nextKey)
      pendingPaths.push([...pendingPath, nextKey])
    }
  }
  return []
}

// build one prod fixture version with a parseable version and no workspace flag
function toFixtureVersion({
  name,
  version,
  isDirect,
  dependencyKeys = [],
}: FixtureVersionOptions): DependencyVersion {
  return {
    name,
    version,
    scope: 'prod',
    isDirect,
    isWorkspace: false,
    isVersionUnparseable: false,
    dependencyKeys,
  }
}

// format a version as its name@version key
function toDependencyKey(dependencyVersion: DependencyVersion): string {
  return `${dependencyVersion.name}@${dependencyVersion.version}`
}
