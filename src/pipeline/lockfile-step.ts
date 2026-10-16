// the parse-lockfiles step: parses every changed lockfile at base and head with its package.json and diffs the two sets
import { posix } from 'node:path'
import { diffDependencySets } from '@/lockfile/dependency-diff'
import { detectLockfiles, parseLockfile } from '@/lockfile/lockfile-registry'
import type {
  DependencyDiff,
  DependencySet,
  LockfileKind,
} from '@/shared/dependency'
import type {
  ChangedFile,
  PullRequestSource,
} from '@/shared/pull-request-source'

// one lockfile the pull request changed. it is parsed at both sides and diffed
export interface LockfileChange {
  lockfilePath: string
  lockfileKind: LockfileKind
  baseDependencySet: DependencySet
  headDependencySet: DependencySet
  dependencyDiff: DependencyDiff
}

// the parsed lockfile changes and the changed lockfiles no parser reads
export interface ParsedLockfiles {
  lockfileChanges: LockfileChange[]
  unsupportedLockfilePaths: string[]
}

// the source to read from and the files the pull request changed
export interface ParseLockfilesOptions {
  pullRequestSource: PullRequestSource
  changedFiles: ChangedFile[]
}

// the package.json text used when a lockfile has none beside it
const emptyPackageJson = '{}'

/**
 * Parses every changed lockfile the pull request keeps, at base and head, and diffs the two dependency sets.
 */
export async function parseLockfiles({
  pullRequestSource,
  changedFiles,
}: ParseLockfilesOptions): Promise<ParsedLockfiles> {
  // find the lockfiles among the files that still exist at head
  const changedFilesByPath = new Map(
    changedFiles.map((changedFile) => [changedFile.path, changedFile]),
  )
  const keptPaths = changedFiles
    .filter((changedFile) => changedFile.status !== 'deleted')
    .map((changedFile) => changedFile.path)
  const detectedLockfiles = detectLockfiles(keptPaths)

  // parse each supported lockfile and list the unsupported ones
  const lockfileChanges: LockfileChange[] = []
  const unsupportedLockfilePaths: string[] = []
  for (const detectedLockfile of detectedLockfiles) {
    if (detectedLockfile.status === 'unsupported') {
      unsupportedLockfilePaths.push(detectedLockfile.path)
      continue
    }
    const lockfileChange = await parseLockfileChange({
      pullRequestSource,
      changedFile: changedFilesByPath.get(detectedLockfile.path),
      lockfilePath: detectedLockfile.path,
      lockfileKind: detectedLockfile.lockfileKind,
    })
    lockfileChanges.push(lockfileChange)
  }

  return { lockfileChanges, unsupportedLockfilePaths }
}

// one changed lockfile to parse
interface ParseLockfileChangeOptions {
  pullRequestSource: PullRequestSource
  changedFile: ChangedFile | undefined
  lockfilePath: string
  lockfileKind: LockfileKind
}

// parse one lockfile at head and at base. a lockfile the pull request adds has an empty base
async function parseLockfileChange({
  pullRequestSource,
  changedFile,
  lockfilePath,
  lockfileKind,
}: ParseLockfileChangeOptions): Promise<LockfileChange> {
  // parse the head side
  const headDependencySet = await readDependencySet({
    readFile: (path) => pullRequestSource.readFileAtHead(path),
    lockfilePath,
    lockfileKind,
  })

  // parse the base side from the previous path of a renamed lockfile
  const baseLockfilePath = changedFile?.previousPath ?? lockfilePath
  const baseDependencySet =
    changedFile?.status === 'added'
      ? createEmptyDependencySet({ lockfilePath, lockfileKind })
      : await readDependencySet({
          readFile: (path) => pullRequestSource.readFileAtBase(path),
          lockfilePath: baseLockfilePath,
          lockfileKind,
        })

  // diff the two sides
  const dependencyDiff = diffDependencySets({
    baseDependencySet,
    headDependencySet,
  })
  return {
    lockfilePath,
    lockfileKind,
    baseDependencySet,
    headDependencySet,
    dependencyDiff,
  }
}

// a reader for one side of the pull request and the lockfile to read with it
interface ReadDependencySetOptions {
  readFile: (path: string) => Promise<string | null>
  lockfilePath: string
  lockfileKind: LockfileKind
}

// read a lockfile and the package.json in its directory and parse them. a missing lockfile is an empty set
async function readDependencySet({
  readFile,
  lockfilePath,
  lockfileKind,
}: ReadDependencySetOptions): Promise<DependencySet> {
  // a side without the lockfile has no dependencies
  const lockfileContent = await readFile(lockfilePath)
  if (lockfileContent === null) {
    return createEmptyDependencySet({ lockfilePath, lockfileKind })
  }

  // parse it with the package.json beside it
  const packageJsonPath = posix.join(
    posix.dirname(lockfilePath),
    'package.json',
  )
  const rootPackageJson = (await readFile(packageJsonPath)) ?? emptyPackageJson
  return parseLockfile({
    content: lockfileContent,
    lockfileKind,
    lockfilePath,
    rootPackageJson,
  })
}

// the lockfile an empty set stands for
interface CreateEmptyDependencySetOptions {
  lockfilePath: string
  lockfileKind: LockfileKind
}

// a dependency set with no dependencies
function createEmptyDependencySet({
  lockfilePath,
  lockfileKind,
}: CreateEmptyDependencySetOptions): DependencySet {
  return {
    lockfileKind,
    lockfilePath,
    versionsByDependency: new Map(),
    directDependencyNames: new Set(),
  }
}
