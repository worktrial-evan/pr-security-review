// reads the dependency maps of a root package.json and of the workspace entries a lockfile records
import { z } from 'zod'
import type { LockfileKind } from '@/shared/dependency'
import { LockfileParseError } from './lockfile-parse-error'

// one dependency map from package name to version range. a missing map is empty
const dependencyMapSchema = z.record(z.string(), z.string()).default({})

// the four dependency maps of a package.json or of a workspace entry in a lockfile
export const packageManifestSchema = z.object({
  dependencies: dependencyMapSchema,
  devDependencies: dependencyMapSchema,
  optionalDependencies: dependencyMapSchema,
  peerDependencies: dependencyMapSchema,
})
export type PackageManifest = z.infer<typeof packageManifestSchema>

// the package.json text and the kind of lockfile it goes with
export interface ParsePackageManifestOptions {
  content: string
  lockfileKind: LockfileKind
}

/** Parses the text of a root package.json into its four dependency maps, throwing a LockfileParseError when it is not valid. */
export function parsePackageManifest({
  content,
  lockfileKind,
}: ParsePackageManifestOptions): PackageManifest {
  // read the json and reject text that is not json
  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(content)
  } catch {
    throw new LockfileParseError({
      lockfileKind,
      reason: 'malformed',
      detail: 'the root package.json is not valid json',
    })
  }

  // reject a package.json whose dependency maps have the wrong shape
  const manifestParseResult = packageManifestSchema.safeParse(manifestJson)
  if (!manifestParseResult.success) {
    throw new LockfileParseError({
      lockfileKind,
      reason: 'malformed',
      detail: 'the root package.json has invalid dependency maps',
    })
  }
  return manifestParseResult.data
}

// where the dependencies of one package.json or workspace entry resolve to
export interface ManifestLocations {
  productionLocations: string[]
  developmentLocations: string[]
  directLocations: string[]
}

// a manifest and how to resolve its names to install locations
export interface ResolveManifestLocationsOptions {
  packageManifest: PackageManifest
  resolveNames: (dependencyNames: string[]) => string[]
}

/** Resolves the production, development and direct names of a manifest to install locations. */
export function resolveManifestLocations({
  packageManifest,
  resolveNames,
}: ResolveManifestLocationsOptions): ManifestLocations {
  return {
    productionLocations: resolveNames(
      listProductionDependencyNames(packageManifest),
    ),
    developmentLocations: resolveNames(listDevDependencyNames(packageManifest)),
    directLocations: resolveNames(listDirectDependencyNames(packageManifest)),
  }
}

/** Lists the names under dependencies, optionalDependencies and peerDependencies, sorted and without repeats. */
export function listProductionDependencyNames(
  packageManifest: PackageManifest,
): string[] {
  return toSortedUniqueNames([
    packageManifest.dependencies,
    packageManifest.optionalDependencies,
    packageManifest.peerDependencies,
  ])
}

// list the names under devDependencies
function listDevDependencyNames(packageManifest: PackageManifest): string[] {
  return toSortedUniqueNames([packageManifest.devDependencies])
}

// list the names under any of the four dependency maps
function listDirectDependencyNames(packageManifest: PackageManifest): string[] {
  return toSortedUniqueNames([
    packageManifest.dependencies,
    packageManifest.devDependencies,
    packageManifest.optionalDependencies,
    packageManifest.peerDependencies,
  ])
}

// collect the keys of every map once, in sorted order
function toSortedUniqueNames(
  dependencyMaps: Record<string, string>[],
): string[] {
  const dependencyNames = new Set(
    dependencyMaps.flatMap((dependencyMap) => Object.keys(dependencyMap)),
  )
  return [...dependencyNames].sort()
}
