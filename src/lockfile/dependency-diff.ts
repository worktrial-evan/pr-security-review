// diffs a base and a head dependency set into added, removed and changed versions. a pull request introduces only the added and changed entries
import type {
  DependencyChange,
  DependencyDiff,
  DependencySet,
  DependencyVersion,
} from '@/shared/dependency'

// the dependency sets of the base and head revisions
export interface DiffDependencySetsOptions {
  baseDependencySet: DependencySet
  headDependencySet: DependencySet
}

/** Diffs two dependency sets. A package that swaps exactly one version for another is changed, any other difference is added or removed. */
export function diffDependencySets({
  baseDependencySet,
  headDependencySet,
}: DiffDependencySetsOptions): DependencyDiff {
  // visit every package name from either side in sorted order
  const dependencyNames = new Set([
    ...baseDependencySet.versionsByDependency.keys(),
    ...headDependencySet.versionsByDependency.keys(),
  ])
  const sortedDependencyNames = [...dependencyNames].sort()

  // diff each package and add its entries to the result
  const dependencyDiff: DependencyDiff = {
    added: [],
    removed: [],
    changed: [],
    unchangedCount: 0,
  }
  for (const dependencyName of sortedDependencyNames) {
    const packageDiff = diffPackageVersions({
      dependencyName,
      baseVersions:
        baseDependencySet.versionsByDependency.get(dependencyName) ?? [],
      headVersions:
        headDependencySet.versionsByDependency.get(dependencyName) ?? [],
    })
    dependencyDiff.added.push(...packageDiff.added)
    dependencyDiff.removed.push(...packageDiff.removed)
    dependencyDiff.changed.push(...packageDiff.changed)
    dependencyDiff.unchangedCount += packageDiff.unchangedCount
  }
  return dependencyDiff
}

// one package name and its versions on each side
interface DiffPackageVersionsOptions {
  dependencyName: string
  baseVersions: DependencyVersion[]
  headVersions: DependencyVersion[]
}

// diff the versions of one package
function diffPackageVersions({
  dependencyName,
  baseVersions,
  headVersions,
}: DiffPackageVersionsOptions): DependencyDiff {
  // find the versions only one side has
  const baseVersionStrings = new Set(baseVersions.map(({ version }) => version))
  const headVersionStrings = new Set(headVersions.map(({ version }) => version))
  const addedVersions = headVersions.filter(
    ({ version }) => !baseVersionStrings.has(version),
  )
  const removedVersions = baseVersions.filter(
    ({ version }) => !headVersionStrings.has(version),
  )
  const unchangedCount = headVersions.length - addedVersions.length

  // report one version swapped for another as a change
  const [addedVersion] = addedVersions
  const [removedVersion] = removedVersions
  const isSingleSwap =
    addedVersions.length === 1 && removedVersions.length === 1
  if (isSingleSwap && addedVersion && removedVersion) {
    const dependencyChange: DependencyChange = {
      name: dependencyName,
      fromVersion: removedVersion.version,
      toVersion: addedVersion.version,
    }
    return {
      added: [],
      removed: [],
      changed: [dependencyChange],
      unchangedCount,
    }
  }
  return {
    added: addedVersions,
    removed: removedVersions,
    changed: [],
    unchangedCount,
  }
}
