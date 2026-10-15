// parses a package-lock.json of version 2 or 3 into install nodes through its packages map. each node_modules path is one node
import { z } from 'zod'
import {
  type LockfileNode,
  type LockfileParserOptions,
  type ParsedLockfile,
  toParsedLockfile,
} from './lockfile-node'
import { LockfileParseError } from './lockfile-parse-error'
import {
  listProductionDependencyNames,
  type PackageManifest,
  packageManifestSchema,
  resolveManifestLocations,
} from './package-manifest'

// the package-lock.json versions this parser reads
const supportedNpmLockfileVersions = [2, 3]

// the path segment npm installs every package under
const nodeModulesSegment = 'node_modules/'

// the version prefix of a workspace package
const workspaceVersionPrefix = 'workspace:'

// the resolved prefixes that mark a git or local file dependency
const specifierResolvedPrefixes = ['git+', 'git:', 'github:', 'file:']

// one entry of the packages map. a linked entry points at a folder entry through resolved
const npmPackageEntrySchema = packageManifestSchema.extend({
  name: z.string().optional(),
  version: z.string().optional(),
  resolved: z.string().optional(),
  link: z.boolean().optional(),
  workspaces: z
    .union([
      z.array(z.string()),
      z
        .object({ packages: z.array(z.string()) })
        .transform((workspaceConfig) => workspaceConfig.packages),
    ])
    .optional(),
})
type NpmPackageEntry = z.infer<typeof npmPackageEntrySchema>

// the parts of a package-lock.json this parser reads
const npmLockfileSchema = z.object({
  lockfileVersion: z.number(),
  packages: z.record(z.string(), npmPackageEntrySchema).default({}),
})
type NpmLockfile = z.infer<typeof npmLockfileSchema>

/** Parses the text of a package-lock.json into install nodes and the locations the root and workspace dependencies resolve to. */
export function parseNpmLockfile({
  content,
  rootManifest,
}: LockfileParserOptions): ParsedLockfile {
  // read the lockfile and build one node per node_modules path
  const npmLockfile = readNpmLockfile(content)
  const packageLocations = new Set(Object.keys(npmLockfile.packages).sort())
  const installLocations = [...packageLocations].filter((location) =>
    location.includes(nodeModulesSegment),
  )
  const nodes = installLocations.map((location) =>
    toNpmLockfileNode({ location, npmLockfile, packageLocations }),
  )

  // resolve the root dependencies from the top of the lockfile
  const rootManifestLocations = resolveManifestLocations({
    packageManifest: rootManifest,
    resolveNames: (dependencyNames) =>
      resolveNpmLocations({
        dependencyNames,
        fromLocation: '',
        packageLocations,
      }),
  })

  // resolve the dependencies of every workspace package from its folder
  const workspaceNodes = nodes.filter(
    (lockfileNode) => lockfileNode.isWorkspace,
  )
  const workspaceManifestLocations = workspaceNodes.map((workspaceNode) => {
    const workspacePath = workspaceNode.version.slice(
      workspaceVersionPrefix.length,
    )
    return resolveManifestLocations({
      packageManifest:
        npmLockfile.packages[workspacePath] ?? createEmptyPackageEntry(),
      resolveNames: (dependencyNames) =>
        resolveNpmLocations({
          dependencyNames,
          fromLocation: workspacePath,
          packageLocations,
        }),
    })
  })
  return toParsedLockfile({
    nodes,
    rootManifestLocations,
    workspaceManifestLocations,
  })
}

// parse the json and check its version and shape
function readNpmLockfile(content: string): NpmLockfile {
  // reject text that is not json
  let lockfileJson: unknown
  try {
    lockfileJson = JSON.parse(content)
  } catch {
    throw new LockfileParseError({
      lockfileKind: 'npm',
      reason: 'malformed',
      detail: 'the text is not valid json',
    })
  }

  // reject a lockfile whose packages map has the wrong shape
  const npmLockfileParseResult = npmLockfileSchema.safeParse(lockfileJson)
  if (!npmLockfileParseResult.success) {
    throw new LockfileParseError({
      lockfileKind: 'npm',
      reason: 'malformed',
      detail: 'the packages map has an unexpected shape',
    })
  }

  // reject version 1, which has no packages map, and any version newer than 3
  const { lockfileVersion } = npmLockfileParseResult.data
  if (!supportedNpmLockfileVersions.includes(lockfileVersion)) {
    throw new LockfileParseError({
      lockfileKind: 'npm',
      reason: 'unsupported-version',
      detail: `lockfileVersion ${lockfileVersion} is not supported`,
    })
  }
  return npmLockfileParseResult.data
}

// one node_modules path, the whole lockfile and the set of every package location
interface ToNpmLockfileNodeOptions {
  location: string
  npmLockfile: NpmLockfile
  packageLocations: Set<string>
}

// the version, real name, dependency maps and resolution start of one installed package
interface NpmInstallFacts {
  version: string
  isWorkspace: boolean
  realPackageName: string | undefined
  dependencyManifest: PackageManifest
  resolveFromLocation: string
}

// turn one node_modules entry into a node with its dependencies resolved
function toNpmLockfileNode({
  location,
  npmLockfile,
  packageLocations,
}: ToNpmLockfileNodeOptions): LockfileNode {
  // read the installed name from the last node_modules segment
  const installedName = location.slice(
    location.lastIndexOf(nodeModulesSegment) + nodeModulesSegment.length,
  )
  const npmPackageEntry =
    npmLockfile.packages[location] ?? createEmptyPackageEntry()
  const npmInstallFacts = npmPackageEntry.link
    ? readLinkedInstallFacts({ npmPackageEntry, npmLockfile })
    : readInstalledInstallFacts({ npmPackageEntry, location })

  // resolve dependencies, optional dependencies and peers
  const lockfileNode: LockfileNode = {
    location,
    name: installedName,
    version: npmInstallFacts.version,
    isWorkspace: npmInstallFacts.isWorkspace,
    dependencyLocations: resolveNpmLocations({
      dependencyNames: listProductionDependencyNames(
        npmInstallFacts.dependencyManifest,
      ),
      fromLocation: npmInstallFacts.resolveFromLocation,
      packageLocations,
    }),
  }

  // keep the aliased package name when the path names an alias
  const { realPackageName } = npmInstallFacts
  if (realPackageName && realPackageName !== installedName) {
    lockfileNode.realPackageName = realPackageName
  }
  return lockfileNode
}

// a linked entry and the whole lockfile
interface ReadLinkedInstallFactsOptions {
  npmPackageEntry: NpmPackageEntry
  npmLockfile: NpmLockfile
}

// read a linked entry from the folder it points at. a folder that matches a root workspace pattern is a workspace, any other is a file link
function readLinkedInstallFacts({
  npmPackageEntry,
  npmLockfile,
}: ReadLinkedInstallFactsOptions): NpmInstallFacts {
  const targetPath = npmPackageEntry.resolved ?? ''
  const targetEntry =
    npmLockfile.packages[targetPath] ?? createEmptyPackageEntry()
  const workspacePatterns = npmLockfile.packages['']?.workspaces ?? []
  const isWorkspace = workspacePatterns.some((workspacePattern) =>
    new Bun.Glob(workspacePattern).match(targetPath),
  )
  return {
    version: `${isWorkspace ? workspaceVersionPrefix : 'file:'}${targetPath}`,
    isWorkspace,
    realPackageName: targetEntry.name,
    dependencyManifest: targetEntry,
    resolveFromLocation: targetPath,
  }
}

// an installed entry and its location
interface ReadInstalledInstallFactsOptions {
  npmPackageEntry: NpmPackageEntry
  location: string
}

// read an installed entry. a git or file dependency keeps its resolved string as the version
function readInstalledInstallFacts({
  npmPackageEntry,
  location,
}: ReadInstalledInstallFactsOptions): NpmInstallFacts {
  const { resolved, version } = npmPackageEntry
  const isSpecifierResolved = specifierResolvedPrefixes.some((prefix) =>
    resolved?.startsWith(prefix),
  )
  const installedVersion = isSpecifierResolved ? resolved : version
  if (!installedVersion) {
    throw new LockfileParseError({
      lockfileKind: 'npm',
      reason: 'malformed',
      detail: `the entry for '${location}' has no version`,
    })
  }
  return {
    version: installedVersion,
    isWorkspace: false,
    realPackageName: npmPackageEntry.name,
    dependencyManifest: npmPackageEntry,
    resolveFromLocation: location,
  }
}

// the names to resolve, the location they are depended on from and every package location
interface ResolveNpmLocationsOptions {
  dependencyNames: string[]
  fromLocation: string
  packageLocations: Set<string>
}

// resolve each name and skip a name found nowhere
function resolveNpmLocations({
  dependencyNames,
  fromLocation,
  packageLocations,
}: ResolveNpmLocationsOptions): string[] {
  return dependencyNames.flatMap((dependencyName) => {
    const dependencyLocation = resolveNpmLocation({
      dependencyName,
      fromLocation,
      packageLocations,
    })
    return dependencyLocation === undefined ? [] : [dependencyLocation]
  })
}

// one name to resolve, the location it is depended on from and every package location
interface ResolveNpmLocationOptions {
  dependencyName: string
  fromLocation: string
  packageLocations: Set<string>
}

// resolve one name the way node does: the nearest node_modules folder first, then each parent up to the top
function resolveNpmLocation({
  dependencyName,
  fromLocation,
  packageLocations,
}: ResolveNpmLocationOptions): string | undefined {
  let searchLocation = fromLocation
  while (true) {
    // look in the node_modules folder of the current location
    const candidateLocation = searchLocation
      ? `${searchLocation}/${nodeModulesSegment}${dependencyName}`
      : `${nodeModulesSegment}${dependencyName}`
    if (packageLocations.has(candidateLocation)) {
      return candidateLocation
    }

    // stop after the top level, otherwise step out one folder
    if (!searchLocation) {
      return undefined
    }
    searchLocation = toParentLocation(searchLocation)
  }
}

// step out of the innermost node_modules folder. a top level package or a folder outside node_modules steps to the root
function toParentLocation(location: string): string {
  const nestedSegmentIndex = location.lastIndexOf(`/${nodeModulesSegment}`)
  return nestedSegmentIndex >= 0 ? location.slice(0, nestedSegmentIndex) : ''
}

// an entry with no fields and empty dependency maps
function createEmptyPackageEntry(): NpmPackageEntry {
  return npmPackageEntrySchema.parse({})
}
