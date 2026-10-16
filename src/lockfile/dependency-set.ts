// builds a dependency set from the install nodes a lockfile parser returns: scope, direct flags, one entry per name@version and a sorted order
import type {
  DependencyScope,
  DependencySet,
  DependencyVersion,
  LockfileKind,
} from '@/shared/dependency'
import type { LockfileNode, ParsedLockfile } from './lockfile-node'
import {
  compareDependencyVersions,
  isVersionUnparseable,
} from './sorted-dependency-versions'

// the parsed lockfile and where it came from
export interface BuildDependencySetOptions {
  parsedLockfile: ParsedLockfile
  lockfileKind: LockfileKind
  lockfilePath: string
}

// the facts about the install locations that every node needs
interface InstallLocationFacts {
  nodesByLocation: Map<string, LockfileNode>
  productionLocations: Set<string>
  developmentLocations: Set<string>
  directLocations: Set<string>
}

/** Builds a dependency set with one entry per name@version, in name and version order. */
export function buildDependencySet({
  parsedLockfile,
  lockfileKind,
  lockfilePath,
}: BuildDependencySetOptions): DependencySet {
  // find what every install location is and merge the nodes into one entry per name@version
  const installLocationFacts = findInstallLocationFacts(parsedLockfile)
  const versionsByKey = mergeNodesByKey({
    lockfileNodes: parsedLockfile.nodes,
    installLocationFacts,
  })

  // sort the entries and group them by name
  const sortedDependencyVersions = [...versionsByKey.values()].sort(
    (first, second) => compareDependencyVersions({ first, second }),
  )
  return {
    lockfileKind,
    lockfilePath,
    versionsByDependency: groupByName(sortedDependencyVersions),
    directDependencyNames: findDirectDependencyNames(sortedDependencyVersions),
  }
}

/** Returns the name@version key that dependencyKeys and the dependency graph use for a version. */
export function toDependencyKey(
  dependencyVersion: Pick<DependencyVersion, 'name' | 'version'>,
): string {
  return `${dependencyVersion.name}@${dependencyVersion.version}`
}

// index the nodes and find what the production and development roots reach
function findInstallLocationFacts(
  parsedLockfile: ParsedLockfile,
): InstallLocationFacts {
  const nodesByLocation = new Map(
    parsedLockfile.nodes.map((lockfileNode) => [
      lockfileNode.location,
      lockfileNode,
    ]),
  )
  return {
    nodesByLocation,
    productionLocations: findReachableLocations({
      rootLocations: parsedLockfile.productionRootLocations,
      nodesByLocation,
    }),
    developmentLocations: findReachableLocations({
      rootLocations: parsedLockfile.developmentRootLocations,
      nodesByLocation,
    }),
    directLocations: new Set(parsedLockfile.directLocations),
  }
}

// the roots of a walk and the nodes to walk through
interface FindReachableLocationsOptions {
  rootLocations: string[]
  nodesByLocation: Map<string, LockfileNode>
}

// walk breadth first from the roots and collect every location reached
function findReachableLocations({
  rootLocations,
  nodesByLocation,
}: FindReachableLocationsOptions): Set<string> {
  const reachedLocations = new Set<string>()
  const pendingLocations = [...rootLocations]
  for (let i = 0; i < pendingLocations.length; i++) {
    const location = pendingLocations[i] ?? ''

    // skip a location already reached or missing from the lockfile
    const lockfileNode = nodesByLocation.get(location)
    if (reachedLocations.has(location) || !lockfileNode) {
      continue
    }
    reachedLocations.add(location)
    pendingLocations.push(...lockfileNode.dependencyLocations)
  }
  return reachedLocations
}

// the nodes of a lockfile and the facts about every install location
interface MergeNodesByKeyOptions {
  lockfileNodes: LockfileNode[]
  installLocationFacts: InstallLocationFacts
}

// turn every node into a dependency version and merge copies of one name@version
function mergeNodesByKey({
  lockfileNodes,
  installLocationFacts,
}: MergeNodesByKeyOptions): Map<string, DependencyVersion> {
  const versionsByKey = new Map<string, DependencyVersion>()
  for (const lockfileNode of lockfileNodes) {
    const dependencyVersion = toDependencyVersion({
      lockfileNode,
      installLocationFacts,
    })
    const dependencyKey = toDependencyKey(dependencyVersion)
    const knownDependencyVersion = versionsByKey.get(dependencyKey)
    versionsByKey.set(
      dependencyKey,
      knownDependencyVersion
        ? mergeDependencyVersions({ knownDependencyVersion, dependencyVersion })
        : dependencyVersion,
    )
  }
  return versionsByKey
}

// one node and the facts about every install location
interface ToDependencyVersionOptions {
  lockfileNode: LockfileNode
  installLocationFacts: InstallLocationFacts
}

// turn one node into a dependency version
function toDependencyVersion({
  lockfileNode,
  installLocationFacts,
}: ToDependencyVersionOptions): DependencyVersion {
  // a node is development only when the development roots reach it and no production root does
  const isDevelopmentOnly =
    installLocationFacts.developmentLocations.has(lockfileNode.location) &&
    !installLocationFacts.productionLocations.has(lockfileNode.location)
  const scope: DependencyScope = isDevelopmentOnly
    ? 'development'
    : 'production'

  // point at each dependency by its name@version key
  const dependencyKeys = lockfileNode.dependencyLocations.flatMap(
    (dependencyLocation) => {
      const dependencyNode =
        installLocationFacts.nodesByLocation.get(dependencyLocation)
      return dependencyNode ? [toDependencyKey(dependencyNode)] : []
    },
  )

  // keep the real package name only on an alias
  const dependencyVersion: DependencyVersion = {
    name: lockfileNode.name,
    version: lockfileNode.version,
    scope,
    isDirect: installLocationFacts.directLocations.has(lockfileNode.location),
    isWorkspace: lockfileNode.isWorkspace,
    isVersionUnparseable: isVersionUnparseable(lockfileNode.version),
    dependencyKeys: toSortedUniqueKeys(dependencyKeys),
  }
  if (lockfileNode.realPackageName) {
    dependencyVersion.realPackageName = lockfileNode.realPackageName
  }
  return dependencyVersion
}

// the entry already recorded for a name@version and another copy of it
interface MergeDependencyVersionsOptions {
  knownDependencyVersion: DependencyVersion
  dependencyVersion: DependencyVersion
}

// merge two installed copies of one name@version. production and direct win, and the dependency keys are joined
function mergeDependencyVersions({
  knownDependencyVersion,
  dependencyVersion,
}: MergeDependencyVersionsOptions): DependencyVersion {
  const isEitherProduction =
    knownDependencyVersion.scope === 'production' ||
    dependencyVersion.scope === 'production'
  return {
    ...knownDependencyVersion,
    scope: isEitherProduction ? 'production' : 'development',
    isDirect: knownDependencyVersion.isDirect || dependencyVersion.isDirect,
    dependencyKeys: toSortedUniqueKeys([
      ...knownDependencyVersion.dependencyKeys,
      ...dependencyVersion.dependencyKeys,
    ]),
  }
}

// drop repeated keys and sort the rest
function toSortedUniqueKeys(dependencyKeys: string[]): string[] {
  return [...new Set(dependencyKeys)].sort()
}

// group sorted versions by name, keeping the sorted order of names and versions
function groupByName(
  sortedDependencyVersions: DependencyVersion[],
): Map<string, DependencyVersion[]> {
  const versionsByDependency = new Map<string, DependencyVersion[]>()
  for (const dependencyVersion of sortedDependencyVersions) {
    const dependencyVersions =
      versionsByDependency.get(dependencyVersion.name) ?? []
    dependencyVersions.push(dependencyVersion)
    versionsByDependency.set(dependencyVersion.name, dependencyVersions)
  }
  return versionsByDependency
}

// collect the names of the direct versions
function findDirectDependencyNames(
  sortedDependencyVersions: DependencyVersion[],
): Set<string> {
  const directDependencyVersions = sortedDependencyVersions.filter(
    (dependencyVersion) => dependencyVersion.isDirect,
  )
  return new Set(
    directDependencyVersions.map((dependencyVersion) => dependencyVersion.name),
  )
}
