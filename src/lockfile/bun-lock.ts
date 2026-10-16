// parses a bun.lock into install nodes. each package key is one node, and a nested key such as parent/child is a copy installed under its parent
import { type ParseError, parse as parseJsonc } from 'jsonc-parser'
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

// the bun.lock versions this parser reads
const supportedBunLockfileVersions = [0, 1, 2]

// the specifier prefix of a workspace package
const workspaceSpecifierPrefix = 'workspace:'

// the parts of a bun.lock this parser reads. a package entry is a tuple whose first element is name@specifier
const bunLockfileSchema = z.object({
  lockfileVersion: z.number(),
  workspaces: z.record(z.string(), packageManifestSchema).default({}),
  packages: z.record(z.string(), z.array(z.unknown()).min(1)).default({}),
})
type BunLockfile = z.infer<typeof bunLockfileSchema>

/** Parses the text of a bun.lock into install nodes and the locations the root and workspace dependencies resolve to. */
export function parseBunLockfile({
  content,
  rootManifest,
}: LockfileParserOptions): ParsedLockfile {
  // read the lockfile and build one node per package key
  const bunLockfile = readBunLockfile(content)
  const packageKeys = new Set(Object.keys(bunLockfile.packages).sort())
  const nodes = [...packageKeys].map((packageKey) =>
    toBunLockfileNode({ packageKey, bunLockfile, packageKeys }),
  )

  // resolve the root dependencies from the top of the lockfile
  const rootManifestLocations = resolveManifestLocations({
    packageManifest: rootManifest,
    resolveNames: (dependencyNames) =>
      resolveBunPackageKeys({
        dependencyNames,
        fromPackageKey: '',
        packageKeys,
      }),
  })

  // resolve the dependencies of every workspace package from its own key
  const workspaceNodes = nodes.filter(
    (lockfileNode) => lockfileNode.isWorkspace,
  )
  const workspaceManifestLocations = workspaceNodes.map((workspaceNode) =>
    resolveManifestLocations({
      packageManifest: findWorkspaceManifest({
        bunLockfile,
        workspaceSpecifier: workspaceNode.version,
      }),
      resolveNames: (dependencyNames) =>
        resolveBunPackageKeys({
          dependencyNames,
          fromPackageKey: workspaceNode.location,
          packageKeys,
        }),
    }),
  )
  return toParsedLockfile({
    nodes,
    rootManifestLocations,
    workspaceManifestLocations,
  })
}

// parse the jsonc text with trailing commas and check its shape and version
function readBunLockfile(content: string): BunLockfile {
  // reject text that is not jsonc
  const parseErrors: ParseError[] = []
  const lockfileJson: unknown = parseJsonc(content, parseErrors, {
    allowTrailingComma: true,
  })
  if (parseErrors.length > 0) {
    throw new LockfileParseError({
      lockfileKind: 'bun',
      reason: 'malformed',
      detail: 'the text is not valid jsonc',
    })
  }

  // reject a lockfile whose packages or workspaces have the wrong shape
  const bunLockfileParseResult = bunLockfileSchema.safeParse(lockfileJson)
  if (!bunLockfileParseResult.success) {
    throw new LockfileParseError({
      lockfileKind: 'bun',
      reason: 'malformed',
      detail: 'the packages or workspaces have an unexpected shape',
    })
  }

  // reject a lockfile version this parser does not know
  const { lockfileVersion } = bunLockfileParseResult.data
  if (!supportedBunLockfileVersions.includes(lockfileVersion)) {
    throw new LockfileParseError({
      lockfileKind: 'bun',
      reason: 'unsupported-version',
      detail: `lockfileVersion ${lockfileVersion} is not supported`,
    })
  }
  return bunLockfileParseResult.data
}

// one package key, the whole lockfile and the set of every package key
interface ToBunLockfileNodeOptions {
  packageKey: string
  bunLockfile: BunLockfile
  packageKeys: Set<string>
}

// turn one package entry into a node with its dependencies resolved
function toBunLockfileNode({
  packageKey,
  bunLockfile,
  packageKeys,
}: ToBunLockfileNodeOptions): LockfileNode {
  // split name@specifier and read the name the package is installed under
  const packageEntry = bunLockfile.packages[packageKey] ?? []
  const { resolvedName, specifier } = readResolution({
    packageKey,
    resolution: packageEntry[0],
  })
  const installedName = splitBunPackageKey(packageKey).at(-1) ?? resolvedName

  // read the dependency maps from the workspace entry or the package entry
  const isWorkspace = specifier.startsWith(workspaceSpecifierPrefix)
  const dependencyManifest = isWorkspace
    ? findWorkspaceManifest({ bunLockfile, workspaceSpecifier: specifier })
    : readPackageEntryManifest({ packageKey, packageEntry })

  // resolve dependencies, optional dependencies and peers from this key
  const dependencyLocations = resolveBunPackageKeys({
    dependencyNames: listProductionDependencyNames(dependencyManifest),
    fromPackageKey: packageKey,
    packageKeys,
  })
  const lockfileNode: LockfileNode = {
    location: packageKey,
    name: installedName,
    version: specifier,
    isWorkspace,
    dependencyLocations,
  }

  // keep the aliased package name when the key names an alias
  if (resolvedName !== installedName) {
    lockfileNode.realPackageName = resolvedName
  }
  return lockfileNode
}

// the package key and the first element of its entry
interface ReadResolutionOptions {
  packageKey: string
  resolution: unknown
}

// the package name and specifier of a name@specifier resolution
interface Resolution {
  resolvedName: string
  specifier: string
}

// split name@specifier at the first @ after a leading scope @
function readResolution({
  packageKey,
  resolution,
}: ReadResolutionOptions): Resolution {
  const separatorIndex =
    typeof resolution === 'string' ? resolution.indexOf('@', 1) : -1
  if (typeof resolution !== 'string' || separatorIndex < 1) {
    throw new LockfileParseError({
      lockfileKind: 'bun',
      reason: 'malformed',
      detail: `the entry for '${packageKey}' has no name@specifier`,
    })
  }
  return {
    resolvedName: resolution.slice(0, separatorIndex),
    specifier: resolution.slice(separatorIndex + 1),
  }
}

// the package key and its whole tuple
interface ReadPackageEntryManifestOptions {
  packageKey: string
  packageEntry: unknown[]
}

// read the dependency maps from the first object in the tuple. an entry without one has no dependencies
function readPackageEntryManifest({
  packageKey,
  packageEntry,
}: ReadPackageEntryManifestOptions): PackageManifest {
  const packageMetadata =
    packageEntry
      .slice(1)
      .find((element) => typeof element === 'object' && element !== null) ?? {}
  const manifestParseResult = packageManifestSchema.safeParse(packageMetadata)
  if (!manifestParseResult.success) {
    throw new LockfileParseError({
      lockfileKind: 'bun',
      reason: 'malformed',
      detail: `the entry for '${packageKey}' has invalid dependency maps`,
    })
  }
  return manifestParseResult.data
}

// the lockfile and a workspace specifier such as workspace:packages/utils
interface FindWorkspaceManifestOptions {
  bunLockfile: BunLockfile
  workspaceSpecifier: string
}

// read the dependency maps of the workspace a specifier points at. an unknown workspace has none
function findWorkspaceManifest({
  bunLockfile,
  workspaceSpecifier,
}: FindWorkspaceManifestOptions): PackageManifest {
  const workspacePath = workspaceSpecifier.slice(
    workspaceSpecifierPrefix.length,
  )
  return (
    bunLockfile.workspaces[workspacePath] ?? packageManifestSchema.parse({})
  )
}

// the names to resolve, the key they are depended on from and every package key
interface ResolveBunPackageKeysOptions {
  dependencyNames: string[]
  fromPackageKey: string
  packageKeys: Set<string>
}

// resolve each name and skip a name found nowhere
function resolveBunPackageKeys({
  dependencyNames,
  fromPackageKey,
  packageKeys,
}: ResolveBunPackageKeysOptions): string[] {
  const parentPackageNames = splitBunPackageKey(fromPackageKey)
  return dependencyNames.flatMap((dependencyName) => {
    const dependencyPackageKey = resolveBunPackageKey({
      dependencyName,
      parentPackageNames,
      packageKeys,
    })
    return dependencyPackageKey === undefined ? [] : [dependencyPackageKey]
  })
}

// one name to resolve, the package names of the key it is depended on from and every package key
interface ResolveBunPackageKeyOptions {
  dependencyName: string
  parentPackageNames: string[]
  packageKeys: Set<string>
}

// resolve one name to the nearest key, from the copy nested under the full parent key up to the top level
function resolveBunPackageKey({
  dependencyName,
  parentPackageNames,
  packageKeys,
}: ResolveBunPackageKeyOptions): string | undefined {
  for (let depth = parentPackageNames.length; depth >= 0; depth--) {
    const candidateKey = [
      ...parentPackageNames.slice(0, depth),
      dependencyName,
    ].join('/')
    if (packageKeys.has(candidateKey)) {
      return candidateKey
    }
  }
  return undefined
}

// split a package key into package names, keeping @scope/name together
function splitBunPackageKey(packageKey: string): string[] {
  const keyParts = packageKey.split('/').filter((keyPart) => keyPart !== '')
  const packageNames: string[] = []
  for (let i = 0; i < keyParts.length; i++) {
    const keyPart = keyParts[i] ?? ''
    if (keyPart.startsWith('@')) {
      packageNames.push(`${keyPart}/${keyParts[i + 1] ?? ''}`)
      i++
      continue
    }
    packageNames.push(keyPart)
  }
  return packageNames
}
