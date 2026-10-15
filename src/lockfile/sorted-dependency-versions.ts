// the deterministic order of dependency versions: by name, then semver ascending, then versions that are not semver in string order
import semver from 'semver'
import type { DependencySet, DependencyVersion } from '@/shared/dependency'

// the two dependency versions to order
export interface CompareDependencyVersionsOptions {
  first: DependencyVersion
  second: DependencyVersion
}

/** Returns the flat list of every version in a dependency set, sorted by name and then by version. */
export function toSortedDependencyVersions(
  dependencySet: DependencySet,
): DependencyVersion[] {
  // flatten the versions of every package into one list
  const dependencyVersions = [
    ...dependencySet.versionsByDependency.values(),
  ].flat()

  // sort a copy so the set itself is left as it is
  return dependencyVersions.sort((first, second) =>
    compareDependencyVersions({ first, second }),
  )
}

/** Compares two dependency versions by name in code unit order, then by version. */
export function compareDependencyVersions({
  first,
  second,
}: CompareDependencyVersionsOptions): number {
  // order by name first
  const nameOrder = compareStrings({ first: first.name, second: second.name })
  if (nameOrder !== 0) {
    return nameOrder
  }
  return compareVersionStrings({
    firstVersion: first.version,
    secondVersion: second.version,
  })
}

/** Reports whether a version string is not valid semver. */
export function isVersionUnparseable(version: string): boolean {
  return semver.valid(version) === null
}

// the two version strings to order
interface CompareVersionStringsOptions {
  firstVersion: string
  secondVersion: string
}

// order semver versions ascending and before any version that is not semver
function compareVersionStrings({
  firstVersion,
  secondVersion,
}: CompareVersionStringsOptions): number {
  const isFirstVersionUnparseable = isVersionUnparseable(firstVersion)
  const isSecondVersionUnparseable = isVersionUnparseable(secondVersion)

  // compare two semver versions by precedence. build metadata ties fall through to string order
  if (!isFirstVersionUnparseable && !isSecondVersionUnparseable) {
    const semverOrder = semver.compare(firstVersion, secondVersion)
    if (semverOrder !== 0) {
      return semverOrder
    }
  }

  // put a semver version before one that is not semver
  if (isFirstVersionUnparseable !== isSecondVersionUnparseable) {
    return isFirstVersionUnparseable ? 1 : -1
  }
  return compareStrings({ first: firstVersion, second: secondVersion })
}

// the two strings to order
interface CompareStringsOptions {
  first: string
  second: string
}

// compare by code unit so the order never depends on the locale
function compareStrings({ first, second }: CompareStringsOptions): number {
  if (first < second) {
    return -1
  }
  if (first > second) {
    return 1
  }
  return 0
}
