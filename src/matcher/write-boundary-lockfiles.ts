// writes the boundary lockfiles under src/matcher/fixtures/boundary-cases: every subset package at every range boundary of its advisories, for bun run validate-matcher
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import semver from 'semver'
import { z } from 'zod'
import {
  type Advisory,
  type AffectedPackage,
  advisorySchema,
} from '@/shared/advisory'
import { normalizePackageName } from '@/shared/package-name'
import { isVersionUnparseable, sortUniqueVersions } from './affected-range'

// the repo root is two directories above this module
const repositoryRoot = resolve(import.meta.dir, '..', '..')

// where the advisory subset index is read from and where the lockfiles are written
const subsetIndexPath = join(
  repositoryRoot,
  'benchmark/fixtures/advisories/npm/index.json',
)
export const boundaryLockfilesDirectory = join(
  import.meta.dir,
  'fixtures',
  'boundary-cases',
)

// the index file as the advisories module writes it: package name to advisories
export const advisoryIndexSchema = z.record(z.string(), z.array(advisorySchema))
export type AdvisoryIndex = z.infer<typeof advisoryIndexSchema>

// the introduced value that marks the beginning of every range. it names no version to install
const rangeBeginning = '0'

// the prerelease tag appended to a boundary version to test prerelease ordering
const prereleaseTag = 'rc.1'

// what one run wrote
export interface WriteBoundaryLockfilesResult {
  lockfileCount: number
  versionCount: number
}

// the advisories of one package name
export interface ListBoundaryVersionsOptions {
  packageName: string
  advisories: Advisory[]
}

// the package and version of one installed entry
interface CreateLockfileEntryOptions {
  packageName: string
  version: string
}

// one lockfile's slot of every package's versions
interface WriteBoundaryCaseOptions {
  caseDirectory: string
  packageNames: string[]
  versionsByPackage: Map<string, string[]>
  lockfileIndex: number
  slotCount: number
}

// the versions of one package to nest under the other top level packages, one per parent
interface AddNestedLockfileEntriesOptions {
  lockfilePackages: Record<string, Record<string, unknown>>
  packageName: string
  nestedVersions: string[]
  parentNames: string[]
}

/** Writes one package-lock.json per slot of boundary versions, each package at one version per node_modules slot. */
export async function writeBoundaryLockfiles(): Promise<WriteBoundaryLockfilesResult> {
  // read the subset and list the boundary versions of every package
  const advisoryIndex = await readAdvisoryIndex(subsetIndexPath)
  const packageNames = Object.keys(advisoryIndex).sort()
  const versionsByPackage = new Map(
    packageNames.map((packageName) => [
      packageName,
      listBoundaryVersions({
        packageName,
        advisories: advisoryIndex[packageName] ?? [],
      }),
    ]),
  )

  // every package has one top level slot and one slot nested under each other package
  const slotCount = packageNames.length
  const lockfileCountsPerPackage = [...versionsByPackage.values()].map(
    (packageVersions) => Math.ceil(packageVersions.length / slotCount),
  )
  const lockfileCount = Math.max(...lockfileCountsPerPackage)

  // start from an empty directory and write one case per lockfile
  await rm(boundaryLockfilesDirectory, { recursive: true, force: true })
  let versionCount = 0
  for (let lockfileIndex = 0; lockfileIndex < lockfileCount; lockfileIndex++) {
    const caseDirectory = join(
      boundaryLockfilesDirectory,
      `case-${String(lockfileIndex + 1).padStart(2, '0')}`,
    )
    await mkdir(caseDirectory, { recursive: true })
    const writeBoundaryCaseResult = await writeBoundaryCase({
      caseDirectory,
      packageNames,
      versionsByPackage,
      lockfileIndex,
      slotCount,
    })
    versionCount += writeBoundaryCaseResult
  }
  return { lockfileCount, versionCount }
}

/** Reads an advisory index file through the contract: a map from normalized package name to its advisories. */
export async function readAdvisoryIndex(
  indexPath: string,
): Promise<AdvisoryIndex> {
  const indexObject: unknown = await Bun.file(indexPath).json()
  return advisoryIndexSchema.parse(indexObject)
}

/** Lists every event or listed version of a package with the next patch version and a prerelease of each, sorted. */
export function listBoundaryVersions({
  packageName,
  advisories,
}: ListBoundaryVersionsOptions): string[] {
  // keep the package's own npm entries of every advisory
  const affectedPackages = advisories.flatMap((advisory) => advisory.affected)
  const ownAffectedPackages = affectedPackages.filter(
    (affectedPackage) =>
      affectedPackage.ecosystem === 'npm' &&
      normalizePackageName(affectedPackage.name) === packageName,
  )

  // collect every event and listed version of those entries with the neighbours of each
  const eventVersions = ownAffectedPackages.flatMap(listAffectedEntryVersions)
  const boundaryVersions = eventVersions.flatMap((eventVersion) => [
    eventVersion,
    ...listNeighbourVersions(eventVersion),
  ])
  return sortUniqueVersions(boundaryVersions)
}

// list the versions one affected entry names: its listed versions and every defined event version other than the range beginning
function listAffectedEntryVersions(affectedPackage: AffectedPackage): string[] {
  const rangeEvents = affectedPackage.ranges.flatMap(
    (advisoryRange) => advisoryRange.events,
  )
  const eventVersions = rangeEvents.flatMap((rangeEvent) => [
    rangeEvent.introduced,
    rangeEvent.fixed,
    rangeEvent.lastAffected,
  ])
  const namedEventVersions = eventVersions.filter(
    (eventVersion): eventVersion is string =>
      eventVersion !== undefined && eventVersion !== rangeBeginning,
  )
  return [...affectedPackage.versions, ...namedEventVersions]
}

// the version one patch above and the prerelease just below a release, or the release of a prerelease. a version
// that does not parse or has build metadata gets no neighbour
function listNeighbourVersions(version: string): string[] {
  if (isVersionUnparseable(version)) {
    return []
  }
  const parsedVersion = new semver.SemVer(version)
  if (parsedVersion.build.length > 0) {
    return []
  }
  const releaseVersion = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`
  if (parsedVersion.prerelease.length > 0) {
    return [releaseVersion]
  }
  const nextPatchVersion = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch + 1}`
  return [nextPatchVersion, `${releaseVersion}-${prereleaseTag}`]
}

// write the package.json and package-lock.json of one case and return how many versions it holds
async function writeBoundaryCase({
  caseDirectory,
  packageNames,
  versionsByPackage,
  lockfileIndex,
  slotCount,
}: WriteBoundaryCaseOptions): Promise<number> {
  // the top level slot of each package is its first version of this lockfile's slice
  const lockfilePackages: Record<string, Record<string, unknown>> = {}
  const rootDependencies: Record<string, string> = {}
  let versionCount = 0
  for (const packageName of packageNames) {
    const packageVersions = versionsByPackage.get(packageName) ?? []
    const sliceVersions = packageVersions.slice(
      lockfileIndex * slotCount,
      (lockfileIndex + 1) * slotCount,
    )
    const [topLevelVersion, ...nestedVersions] = sliceVersions
    if (topLevelVersion === undefined) {
      continue
    }
    lockfilePackages[`node_modules/${packageName}`] = createLockfileEntry({
      packageName,
      version: topLevelVersion,
    })
    rootDependencies[packageName] = topLevelVersion
    versionCount += 1

    // nest the remaining versions under the other top level packages
    const parentNames = packageNames.filter(
      (otherPackageName) => otherPackageName !== packageName,
    )
    versionCount += addNestedLockfileEntries({
      lockfilePackages,
      packageName,
      nestedVersions,
      parentNames,
    })
  }

  // write both files
  const packageJson = {
    name: `boundary-${lockfileIndex + 1}`,
    version: '1.0.0',
    dependencies: rootDependencies,
  }
  const packageLock = {
    name: packageJson.name,
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': packageJson, ...lockfilePackages },
  }
  await Bun.write(
    join(caseDirectory, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  )
  await Bun.write(
    join(caseDirectory, 'package-lock.json'),
    `${JSON.stringify(packageLock, null, 2)}\n`,
  )
  return versionCount
}

// add one nested entry per version under the parent at the same position and return how many were added
function addNestedLockfileEntries({
  lockfilePackages,
  packageName,
  nestedVersions,
  parentNames,
}: AddNestedLockfileEntriesOptions): number {
  let addedCount = 0
  for (const [i, nestedVersion] of nestedVersions.entries()) {
    const parentName = parentNames[i]
    if (parentName === undefined) {
      break
    }
    lockfilePackages[`node_modules/${parentName}/node_modules/${packageName}`] =
      createLockfileEntry({ packageName, version: nestedVersion })
    addedCount += 1
  }
  return addedCount
}

// one installed entry as npm writes a registry package. osv-scanner skips an entry without resolved as a local package
function createLockfileEntry({
  packageName,
  version,
}: CreateLockfileEntryOptions): Record<string, unknown> {
  const unscopedName = packageName.split('/').pop() ?? packageName
  return {
    version,
    resolved: `https://registry.npmjs.org/${packageName}/-/${unscopedName}-${version}.tgz`,
    integrity: 'sha512-AAAA',
  }
}

// run as a script: write the lockfiles and report the counts
if (import.meta.main) {
  const writeBoundaryLockfilesResult = await writeBoundaryLockfiles()
  console.log(
    `wrote ${writeBoundaryLockfilesResult.lockfileCount} lockfiles holding ${writeBoundaryLockfilesResult.versionCount} package versions`,
  )
}
