// validates the hand-written matcher against osv-scanner over every fixture lockfile and fails on any disagreement not accepted in docs/matcher-disagreements.md
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { loadAdvisoryStore } from '@/advisories/advisory-store'
import { resolveAdvisoryCachePaths } from '@/advisories/cache-layout'
import {
  lockfileKindsByFileName,
  parseLockfile,
} from '@/lockfile/lockfile-registry'
import { toSortedDependencyVersions } from '@/lockfile/sorted-dependency-versions'
import { matchDependencies } from '@/matcher/match'
import { createEmptyDependencyDiff } from '@/matcher/matcher-fixtures'
import {
  describeError,
  isOracleAvailable,
  runOracle,
  writeOracleDatabase,
} from '@/matcher/oracle'
import { readAdvisoryIndex } from '@/matcher/write-boundary-lockfiles'
import type { Advisory, AdvisoryStore } from '@/shared/advisory'
import type { DependencySet } from '@/shared/dependency'
import {
  classifyDisagreements,
  type Disagreement,
  readAcceptedDisagreementKeys,
  toDisagreementKey,
} from './matcher-disagreements'

// the repo root is the parent of the scripts directory
export const repositoryRoot = resolve(import.meta.dir, '..')

// where the lockfiles come from, relative to the root. a missing root is empty
export const defaultLockfileRoots = [
  'benchmark/cases',
  'src/lockfile/fixtures',
  'src/matcher/fixtures/boundary-cases',
]

// the cache directory holding the committed advisory subset, relative to the root
export const defaultAdvisoryCacheDir = 'benchmark/fixtures'

// the document of accepted disagreements, relative to the root
export const defaultDisagreementsDocumentPath = 'docs/matcher-disagreements.md'

// every supported lockfile below a root, at any depth
const lockfileGlob = new Bun.Glob('**/{bun.lock,package-lock.json}')

// the tree to validate. every path is relative to root, and each field defaults to the repository value
export interface ValidateMatcherOptions {
  root?: string
  lockfileRoots?: string[]
  advisoryCacheDir?: string
  disagreementsDocumentPath?: string
}

// where to look for lockfiles
export interface ListLockfilePathsOptions {
  root: string
  roots: string[]
}

// what validating one lockfile produced
export type LockfileValidation =
  | {
      status: 'validated'
      lockfilePath: string
      packageCount: number
      findingCount: number
      oracleMatchCount: number
      disagreements: Disagreement[]
    }
  | { status: 'skipped'; lockfilePath: string; reason: string }

// the outcome of the whole run
export interface ValidateMatcherResult {
  validations: LockfileValidation[]
  unacceptedDisagreements: Disagreement[]
}

// one lockfile to run both matchers over, relative to the root
interface ValidateLockfileOptions {
  root: string
  lockfilePath: string
  advisoryStore: AdvisoryStore
  databaseDir: string
}

/** Runs both matchers over every lockfile under the roots and reports the disagreements not accepted in the document. */
export async function validateMatcher({
  root = repositoryRoot,
  lockfileRoots = defaultLockfileRoots,
  advisoryCacheDir = defaultAdvisoryCacheDir,
  disagreementsDocumentPath = defaultDisagreementsDocumentPath,
}: ValidateMatcherOptions = {}): Promise<ValidateMatcherResult> {
  // refuse to validate anything without the oracle
  if (!isOracleAvailable()) {
    throw new Error(
      'osv-scanner is not on PATH, so nothing can be validated. install it with brew install osv-scanner',
    )
  }

  // list every lockfile under the roots
  const lockfilePaths = await listLockfilePaths({ root, roots: lockfileRoots })

  // load the advisory subset for both matchers
  const cacheDir = join(root, advisoryCacheDir)
  const advisoryStore = await loadAdvisoryStore(cacheDir)
  const advisories = await readCachedAdvisories(cacheDir)

  // write the oracle database once and validate every lockfile against it
  const databaseDir = await mkdtemp(join(tmpdir(), 'validate-matcher-'))
  const validations: LockfileValidation[] = []
  try {
    await writeOracleDatabase({ advisories, databaseDir })
    for (const lockfilePath of lockfilePaths) {
      const lockfileValidation = await validateLockfile({
        root,
        lockfilePath,
        advisoryStore,
        databaseDir,
      })
      validations.push(lockfileValidation)
    }
  } finally {
    await rm(databaseDir, { recursive: true, force: true })
  }

  // keep the disagreements the document does not accept
  const acceptedKeys = await readAcceptedKeys(
    join(root, disagreementsDocumentPath),
  )
  const disagreements = validations.flatMap((lockfileValidation) =>
    lockfileValidation.status === 'validated'
      ? lockfileValidation.disagreements
      : [],
  )
  const unacceptedDisagreements = disagreements.filter(
    (disagreement) => !acceptedKeys.has(toDisagreementKey(disagreement)),
  )
  return { validations, unacceptedDisagreements }
}

/** Lists every supported lockfile under the roots, relative to the root and sorted. A missing root is empty. */
export async function listLockfilePaths({
  root,
  roots,
}: ListLockfilePathsOptions): Promise<string[]> {
  const lockfilePaths: string[] = []
  for (const lockfileRoot of roots) {
    // skip a root that does not exist
    const lockfileRootPath = join(root, lockfileRoot)
    if (!isDirectory(lockfileRootPath)) {
      continue
    }

    // collect every lockfile below it
    const relativePaths = await Array.fromAsync(
      lockfileGlob.scan({ cwd: lockfileRootPath, onlyFiles: true }),
    )
    for (const relativePath of relativePaths) {
      lockfilePaths.push(join(lockfileRoot, relativePath))
    }
  }
  return lockfilePaths.sort()
}

// tell whether a path names an existing directory
function isDirectory(directoryPath: string): boolean {
  if (!existsSync(directoryPath)) {
    return false
  }
  return statSync(directoryPath).isDirectory()
}

// read every advisory of the npm index under the cache directory
async function readCachedAdvisories(cacheDir: string): Promise<Advisory[]> {
  const { indexPath } = resolveAdvisoryCachePaths({
    cacheDir,
    ecosystem: 'npm',
  })
  const advisoryIndex = await readAdvisoryIndex(indexPath)
  return Object.values(advisoryIndex).flat()
}

// run both matchers over one lockfile and classify what differs
async function validateLockfile({
  root,
  lockfilePath,
  advisoryStore,
  databaseDir,
}: ValidateLockfileOptions): Promise<LockfileValidation> {
  // read the lockfile and the package.json beside it
  const absoluteLockfilePath = join(root, lockfilePath)
  const packageJsonPath = join(dirname(absoluteLockfilePath), 'package.json')
  const lockfileKind = lockfileKindsByFileName[basename(lockfilePath)]
  if (lockfileKind === undefined) {
    return { status: 'skipped', lockfilePath, reason: 'unsupported file name' }
  }
  if (!existsSync(packageJsonPath)) {
    return {
      status: 'skipped',
      lockfilePath,
      reason: 'no package.json beside it',
    }
  }

  // parse it, reporting a lockfile the parser rejects instead of failing the run
  let dependencySet: DependencySet
  try {
    dependencySet = parseLockfile({
      content: await Bun.file(absoluteLockfilePath).text(),
      lockfileKind,
      lockfilePath,
      rootPackageJson: await Bun.file(packageJsonPath).text(),
    })
  } catch (parseError) {
    return {
      status: 'skipped',
      lockfilePath,
      reason: describeError(parseError),
    }
  }

  // run the hand-written matcher with nothing introduced, then the oracle
  const matchDependenciesResult = await matchDependencies({
    dependencySet,
    dependencyDiff: createEmptyDependencyDiff(),
    advisoryStore,
  })
  const oracleResult = await runOracle({
    lockfilePath: absoluteLockfilePath,
    databaseDir,
  })
  if (oracleResult.status === 'unavailable') {
    throw new Error(
      `the oracle did not run over ${lockfilePath}: ${oracleResult.reason}`,
    )
  }

  // classify the differences
  const dependencyVersions = toSortedDependencyVersions(dependencySet)
  const disagreements = classifyDisagreements({
    lockfilePath,
    dependencyVersions,
    handwrittenFindings: matchDependenciesResult.findings,
    oraclePackages: oracleResult.packages,
    oracleMatches: oracleResult.matches,
  })
  return {
    status: 'validated',
    lockfilePath,
    packageCount: dependencyVersions.length,
    findingCount: matchDependenciesResult.findings.length,
    oracleMatchCount: oracleResult.matches.length,
    disagreements,
  }
}

// read the accepted row keys of the document, or none when it does not exist yet
async function readAcceptedKeys(documentPath: string): Promise<Set<string>> {
  const documentFile = Bun.file(documentPath)
  if (!(await documentFile.exists())) {
    return new Set()
  }
  return readAcceptedDisagreementKeys(await documentFile.text())
}

// print one line per lockfile and one per disagreement, then the totals
function printValidateMatcherResult({
  validations,
  unacceptedDisagreements,
}: ValidateMatcherResult): void {
  // mark every disagreement the document does not accept
  const unacceptedKeys = new Set(unacceptedDisagreements.map(toDisagreementKey))
  let disagreementCount = 0
  for (const lockfileValidation of validations) {
    if (lockfileValidation.status === 'skipped') {
      console.log(
        `${lockfileValidation.lockfilePath}: skipped, ${lockfileValidation.reason}`,
      )
      continue
    }
    const { packageCount, findingCount, oracleMatchCount, disagreements } =
      lockfileValidation
    console.log(
      `${lockfileValidation.lockfilePath}: ${packageCount} packages, ${findingCount} hand-written findings, ${oracleMatchCount} oracle matches, ${disagreements.length} disagreements`,
    )
    for (const disagreement of disagreements) {
      const disagreementKey = toDisagreementKey(disagreement)
      const acceptanceMarker = unacceptedKeys.has(disagreementKey)
        ? 'NEW'
        : 'accepted'
      console.log(`  ${acceptanceMarker}: ${disagreementKey}`)
    }
    disagreementCount += disagreements.length
  }

  // print the totals
  console.log(
    `${disagreementCount} disagreements, ${unacceptedDisagreements.length} not accepted in ${defaultDisagreementsDocumentPath}`,
  )
}

// run as a command: print the report and exit 1 on any unaccepted disagreement or failure
if (import.meta.main) {
  try {
    const validateMatcherResult = await validateMatcher()
    printValidateMatcherResult(validateMatcherResult)
    process.exit(
      validateMatcherResult.unacceptedDisagreements.length > 0 ? 1 : 0,
    )
  } catch (validateError) {
    console.error(describeError(validateError))
    process.exit(1)
  }
}
