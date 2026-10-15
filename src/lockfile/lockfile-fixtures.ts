// reads the fixture lockfiles under src/lockfile/fixtures into dependency sets for the tests in this module
import { join } from 'node:path'
import type { DependencySet, LockfileKind } from '@/shared/dependency'
import { lockfileKindsByFileName, parseLockfile } from './lockfile-registry'

// the fixture cases that exist for both lockfile kinds
export const sharedFixtureCases = [
  'scoped-multi-version',
  'scopes',
  'alias',
  'workspace',
  'specifiers',
  'diff-base',
  'diff-head',
] as const
export type SharedFixtureCase = (typeof sharedFixtureCases)[number]

// the lockfile kind and the fixture folder to read
export interface ReadFixtureOptions {
  lockfileKind: LockfileKind
  fixtureCase: string
}

// the text of a fixture lockfile and of its package.json
export interface FixtureContent {
  lockfileFileName: string
  content: string
  rootPackageJson: string
}

/** Reads the lockfile text and package.json text of one fixture case. */
export async function readFixtureContent({
  lockfileKind,
  fixtureCase,
}: ReadFixtureOptions): Promise<FixtureContent> {
  // find the file name of the kind and read both files from the case folder
  const lockfileFileName = findLockfileFileName(lockfileKind)
  const fixtureDirectory = join(
    import.meta.dir,
    'fixtures',
    lockfileKind,
    fixtureCase,
  )
  return {
    lockfileFileName,
    content: await Bun.file(join(fixtureDirectory, lockfileFileName)).text(),
    rootPackageJson: await Bun.file(
      join(fixtureDirectory, 'package.json'),
    ).text(),
  }
}

/** Parses one fixture case into a dependency set. */
export async function readFixtureDependencySet({
  lockfileKind,
  fixtureCase,
}: ReadFixtureOptions): Promise<DependencySet> {
  const fixtureContent = await readFixtureContent({ lockfileKind, fixtureCase })
  return parseLockfile({
    content: fixtureContent.content,
    lockfileKind,
    lockfilePath: fixtureContent.lockfileFileName,
    rootPackageJson: fixtureContent.rootPackageJson,
  })
}

// find the file name the registry maps to a kind
function findLockfileFileName(lockfileKind: LockfileKind): string {
  const registryEntries = Object.entries(lockfileKindsByFileName)
  const registryEntry = registryEntries.find(
    ([, registeredKind]) => registeredKind === lockfileKind,
  )
  if (!registryEntry) {
    throw new Error(`no lockfile file name is registered for ${lockfileKind}`)
  }
  return registryEntry[0]
}
