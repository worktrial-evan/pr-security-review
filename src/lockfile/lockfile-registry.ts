// detects lockfiles by file name and parses them into dependency sets through one registry. a new lockfile kind is one parser file and one entry in each table here
import type { DependencySet, LockfileKind } from '@/shared/dependency'
import { parseBunLockfile } from './bun-lock'
import { buildDependencySet } from './dependency-set'
import type { LockfileParser } from './lockfile-node'
import { parseNpmLockfile } from './npm-lock'
import { parsePackageManifest } from './package-manifest'

// the lockfile kind each supported file name holds
export const lockfileKindsByFileName: Record<string, LockfileKind> = {
  'bun.lock': 'bun',
  'package-lock.json': 'npm',
}

// the parser of each lockfile kind. the record type requires one for every kind in the contract
const lockfileParsersByKind: Record<LockfileKind, LockfileParser> = {
  bun: parseBunLockfile,
  npm: parseNpmLockfile,
}

// lockfiles other package managers write that are not parsed yet
export const unsupportedLockfileFileNames = [
  'bun.lockb',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
] as const

// one lockfile found in a file list. supported lockfiles name their kind, unsupported ones only their file name
export type DetectedLockfile =
  | { status: 'supported'; path: string; lockfileKind: LockfileKind }
  | { status: 'unsupported'; path: string; fileName: string }

// the lockfile text, its kind and path, and the text of the root package.json it goes with
export interface ParseLockfileOptions {
  content: string
  lockfileKind: LockfileKind
  lockfilePath: string
  rootPackageJson: string
}

/** Picks the lockfiles out of a list of paths, in list order, and marks each one supported or unsupported. Other paths are left out. */
export function detectLockfiles(paths: string[]): DetectedLockfile[] {
  return paths.flatMap((path): DetectedLockfile[] => {
    // match the file name against the supported table first
    const fileName = path.split('/').at(-1) ?? path
    const lockfileKind = lockfileKindsByFileName[fileName]
    if (lockfileKind) {
      return [{ status: 'supported', path, lockfileKind }]
    }

    // report a known lockfile this module cannot parse, and skip anything else
    const isUnsupportedLockfile = (
      unsupportedLockfileFileNames as readonly string[]
    ).includes(fileName)
    return isUnsupportedLockfile
      ? [{ status: 'unsupported', path, fileName }]
      : []
  })
}

/** Parses lockfile text of the given kind into a dependency set, throwing a LockfileParseError for an unsupported version or malformed text. */
export function parseLockfile({
  content,
  lockfileKind,
  lockfilePath,
  rootPackageJson,
}: ParseLockfileOptions): DependencySet {
  // read the root package.json and the lockfile with the parser for its kind
  const rootManifest = parsePackageManifest({
    content: rootPackageJson,
    lockfileKind,
  })
  const parsedLockfile = lockfileParsersByKind[lockfileKind]({
    content,
    rootManifest,
  })
  return buildDependencySet({ parsedLockfile, lockfileKind, lockfilePath })
}
