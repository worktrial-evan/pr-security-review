// reads the advisory fixture and checks the fixture app under benchmark/fixtures: its two lockfiles agree and every package in them has advisory coverage
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ParseError,
  parse as parseJsonc,
  printParseErrorCode,
} from 'jsonc-parser'
import { z } from 'zod'
import { type Advisory, advisorySchema } from '@/shared/advisory'
import { describeZodError } from './error-messages'

// the advisory fixture, with a message for every file that could not be read
export interface AdvisoryFixtureRead {
  advisories: Advisory[]
  knownCleanPackages: string[]
  problems: string[]
}

// the outcome of reading one lockfile as a set of name@version keys
type LockfileRead =
  | { kind: 'loaded'; dependencyKeys: string[] }
  | { kind: 'failed'; message: string }

// the shape of bun.lock this module reads: each package entry starts with name@version
const bunLockfileSchema = z.object({
  packages: z.record(z.string(), z.array(z.unknown())),
})

// the shape of package-lock.json this module reads: version 3 entries keyed by node_modules path
const npmLockfileSchema = z.object({
  lockfileVersion: z.literal(3),
  packages: z.record(z.string(), z.object({ version: z.string().optional() })),
})

// the known-clean list: fixture packages that have no advisory at all
const knownCleanSchema = z.object({ packages: z.array(z.string()) })

/**
 * Reads advisories.json and known-clean.json from the advisory fixture directory, naming each file that cannot be read.
 */
export async function readAdvisoryFixture(
  advisoryFixtureDirectory: string,
): Promise<AdvisoryFixtureRead> {
  // the advisory list is required
  const advisoriesPath = join(advisoryFixtureDirectory, 'advisories.json')
  if (!existsSync(advisoriesPath)) {
    return {
      advisories: [],
      knownCleanPackages: [],
      problems: ['advisory fixture has no advisories.json'],
    }
  }

  // parse it against the shared contract
  const advisoriesJson: unknown = await Bun.file(advisoriesPath).json()
  const advisoriesParseResult = z
    .array(advisorySchema)
    .safeParse(advisoriesJson)
  if (!advisoriesParseResult.success) {
    return {
      advisories: [],
      knownCleanPackages: [],
      problems: [
        `advisories.json does not match the advisory contract: ${describeZodError(advisoriesParseResult.error)}`,
      ],
    }
  }

  // add the known-clean list beside the advisories
  const knownCleanRead = await readKnownCleanList(
    join(advisoryFixtureDirectory, 'known-clean.json'),
  )
  return {
    advisories: advisoriesParseResult.data,
    knownCleanPackages: knownCleanRead.packages,
    problems: knownCleanRead.problems,
  }
}

// the known-clean packages, with a message when the file does not hold a packages list
interface KnownCleanRead {
  packages: string[]
  problems: string[]
}

// read known-clean.json. the list is empty when the file is absent
async function readKnownCleanList(
  knownCleanPath: string,
): Promise<KnownCleanRead> {
  if (!existsSync(knownCleanPath)) {
    return { packages: [], problems: [] }
  }

  // parse the packages list
  const knownCleanJson: unknown = await Bun.file(knownCleanPath).json()
  const knownCleanParseResult = knownCleanSchema.safeParse(knownCleanJson)
  if (!knownCleanParseResult.success) {
    return {
      packages: [],
      problems: [
        `known-clean.json does not hold a packages list: ${describeZodError(knownCleanParseResult.error)}`,
      ],
    }
  }
  return { packages: knownCleanParseResult.data.packages, problems: [] }
}

// the inputs of the fixture app checks
export interface CheckFixtureAppOptions {
  fixtureAppDirectory: string
  advisories: Advisory[]
  knownCleanPackages: string[]
}

/**
 * Checks that the fixture app's two lockfiles agree and that every package in them has advisory coverage, naming each failure.
 */
export async function checkFixtureApp({
  fixtureAppDirectory,
  advisories,
  knownCleanPackages,
}: CheckFixtureAppOptions): Promise<string[]> {
  // read both lockfiles, reporting the ones that cannot be read
  const bunLockfileRead = await readBunLockfile(
    join(fixtureAppDirectory, 'bun.lock'),
  )
  const npmLockfileRead = await readNpmLockfile(
    join(fixtureAppDirectory, 'package-lock.json'),
  )
  const messages: string[] = []
  if (bunLockfileRead.kind === 'failed') {
    messages.push(bunLockfileRead.message)
  }
  if (npmLockfileRead.kind === 'failed') {
    messages.push(npmLockfileRead.message)
  }
  if (bunLockfileRead.kind === 'failed' || npmLockfileRead.kind === 'failed') {
    return messages
  }

  // both name the same name@version set
  messages.push(
    ...compareLockfiles({
      bunDependencyKeys: bunLockfileRead.dependencyKeys,
      npmDependencyKeys: npmLockfileRead.dependencyKeys,
    }),
  )

  // every package name has an advisory or is known clean
  const allDependencyKeys = [
    ...bunLockfileRead.dependencyKeys,
    ...npmLockfileRead.dependencyKeys,
  ]
  messages.push(
    ...checkAdvisoryCoverage({
      dependencyKeys: allDependencyKeys,
      advisories,
      knownCleanPackages,
    }),
  )

  return messages
}

// read bun.lock, a jsonc file whose packages map values start with name@version
async function readBunLockfile(lockfilePath: string): Promise<LockfileRead> {
  if (!existsSync(lockfilePath)) {
    return { kind: 'failed', message: 'fixture app has no bun.lock' }
  }

  // parse the jsonc, reporting the first syntax error
  const lockfileText = await Bun.file(lockfilePath).text()
  const parseErrors: ParseError[] = []
  const lockfileJson: unknown = parseJsonc(lockfileText, parseErrors, {
    allowTrailingComma: true,
  })
  const [firstParseError] = parseErrors
  if (firstParseError !== undefined) {
    return {
      kind: 'failed',
      message: `bun.lock is not valid jsonc: ${printParseErrorCode(firstParseError.error)} at offset ${firstParseError.offset}`,
    }
  }

  // check the shape
  const parseResult = bunLockfileSchema.safeParse(lockfileJson)
  if (!parseResult.success) {
    return {
      kind: 'failed',
      message: `bun.lock does not have a packages map: ${describeZodError(parseResult.error)}`,
    }
  }

  // take the name@version from the first element of every entry
  const dependencyKeys: string[] = []
  for (const [packageKey, packageEntry] of Object.entries(
    parseResult.data.packages,
  )) {
    const [dependencyKey] = packageEntry
    if (typeof dependencyKey !== 'string') {
      return {
        kind: 'failed',
        message: `bun.lock entry "${packageKey}" does not start with name@version`,
      }
    }
    dependencyKeys.push(dependencyKey)
  }
  return { kind: 'loaded', dependencyKeys }
}

// read package-lock.json, whose packages are keyed by their node_modules path
async function readNpmLockfile(lockfilePath: string): Promise<LockfileRead> {
  if (!existsSync(lockfilePath)) {
    return { kind: 'failed', message: 'fixture app has no package-lock.json' }
  }

  // parse the json and check the shape
  const lockfileJson: unknown = await Bun.file(lockfilePath).json()
  const parseResult = npmLockfileSchema.safeParse(lockfileJson)
  if (!parseResult.success) {
    return {
      kind: 'failed',
      message: `package-lock.json is not a version 3 lockfile with a packages map: ${describeZodError(parseResult.error)}`,
    }
  }

  // build name@version from the last node_modules segment and the version. the root entry has no path
  const dependencyKeys: string[] = []
  for (const [packagePath, packageEntry] of Object.entries(
    parseResult.data.packages,
  )) {
    if (packagePath === '' || packageEntry.version === undefined) {
      continue
    }
    const packageName = packagePath.slice(
      packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length,
    )
    dependencyKeys.push(`${packageName}@${packageEntry.version}`)
  }
  return { kind: 'loaded', dependencyKeys }
}

// the inputs of the lockfile comparison
interface CompareLockfilesOptions {
  bunDependencyKeys: string[]
  npmDependencyKeys: string[]
}

// name every name@version one lockfile holds and the other does not
function compareLockfiles({
  bunDependencyKeys,
  npmDependencyKeys,
}: CompareLockfilesOptions): string[] {
  // index both sides for membership checks
  const bunKeySet = new Set(bunDependencyKeys)
  const npmKeySet = new Set(npmDependencyKeys)

  // report in sorted order so the output is stable
  const onlyInBun = [...bunKeySet]
    .filter((dependencyKey) => !npmKeySet.has(dependencyKey))
    .sort()
  const onlyInNpm = [...npmKeySet]
    .filter((dependencyKey) => !bunKeySet.has(dependencyKey))
    .sort()
  return [
    ...onlyInBun.map(
      (dependencyKey) =>
        `bun.lock names ${dependencyKey} but package-lock.json does not`,
    ),
    ...onlyInNpm.map(
      (dependencyKey) =>
        `package-lock.json names ${dependencyKey} but bun.lock does not`,
    ),
  ]
}

// the inputs of the advisory coverage check
interface CheckAdvisoryCoverageOptions {
  dependencyKeys: string[]
  advisories: Advisory[]
  knownCleanPackages: string[]
}

// every package name in the lockfiles has an advisory affecting it or is listed as known clean
function checkAdvisoryCoverage({
  dependencyKeys,
  advisories,
  knownCleanPackages,
}: CheckAdvisoryCoverageOptions): string[] {
  // collect the distinct package names in sorted order
  const packageNames = [
    ...new Set(dependencyKeys.map(packageNameOfDependencyKey)),
  ].sort()

  // name every package nothing covers
  const knownCleanSet = new Set(knownCleanPackages)
  const coveredPackageNames = new Set(
    advisories.flatMap((advisory) =>
      advisory.affected.map((affectedPackage) => affectedPackage.name),
    ),
  )
  const uncoveredPackageNames = packageNames.filter(
    (packageName) =>
      !coveredPackageNames.has(packageName) && !knownCleanSet.has(packageName),
  )
  return uncoveredPackageNames.map(
    (packageName) =>
      `package ${packageName} has no advisory in the fixture and is not listed in known-clean.json`,
  )
}

// the name part of name@version, keeping a scope prefix
function packageNameOfDependencyKey(dependencyKey: string): string {
  // cut at the last @, which a scoped name never ends with
  const versionSeparatorIndex = dependencyKey.lastIndexOf('@')
  if (versionSeparatorIndex <= 0) {
    return dependencyKey
  }
  return dependencyKey.slice(0, versionSeparatorIndex)
}
