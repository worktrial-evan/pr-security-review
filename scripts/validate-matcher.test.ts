// tests the validate-matcher command over a throwaway tree and the repository fixtures, the classification of disagreements, the accepted-row lookup and lockfile discovery over a missing root
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAdvisoryCachePaths } from '@/advisories/cache-layout'
import type { DependencyFinding } from '@/matcher/dependency-finding'
import {
  createDependencyVersion,
  readFixtureAdvisories,
} from '@/matcher/matcher-fixtures'
import { isOracleAvailable } from '@/matcher/oracle'
import type { Advisory, AdvisorySnapshot } from '@/shared/advisory'
import { normalizePackageName } from '@/shared/package-name'
import {
  classifyDisagreements,
  readAcceptedDisagreementKeys,
  toDisagreementKey,
} from './matcher-disagreements'
import {
  listLockfilePaths,
  type ValidateMatcherOptions,
  validateMatcher,
} from './validate-matcher'

// the package version and advisory group of a hand-written finding
interface CreateFindingOptions {
  packageName: string
  version: string
  advisoryId: string
  aliases?: string[]
}

// the paths of the throwaway tree, relative to its root
const throwawayTreeOptions: Omit<ValidateMatcherOptions, 'root'> = {
  lockfileRoots: ['cases'],
  advisoryCacheDir: 'advisory-cache',
  disagreementsDocumentPath: 'accepted-disagreements.md',
}

// the case both matchers agree on apart from its file dependency: range-kit 1.0.0 as a registry package and local-kit from a local folder
const agreedCaseLockfilePath = 'cases/agreed/package-lock.json'
const agreedCaseManifest = {
  name: 'agreed-app',
  version: '1.0.0',
  dependencies: { 'range-kit': '1.0.0', 'local-kit': 'file:../local-kit' },
}
const agreedCaseLockfile = {
  name: agreedCaseManifest.name,
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': agreedCaseManifest,
    'node_modules/range-kit': {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/range-kit/-/range-kit-1.0.0.tgz',
      integrity: 'sha512-AAAA',
    },
    'node_modules/local-kit': {
      version: '1.0.0',
      resolved: 'file:../local-kit',
    },
  },
}

// the disagreements the file dependency produces: osv-scanner reports the version the lockfile entry records and the lockfile module its specifier
const agreedCaseDisagreementKeys = [
  `${agreedCaseLockfilePath} | local-kit@1.0.0 | package-set | oracle-only | -`,
  `${agreedCaseLockfilePath} | local-kit@file:../local-kit | package-set | handwritten-only | -`,
]

// the snapshot written beside the throwaway advisory index
const throwawaySnapshot: AdvisorySnapshot = {
  fetchedAt: '2024-06-01T00:00:00Z',
  sourceUrl: 'https://example.com/npm/all.zip',
  entryCount: 0,
  sha256: '0'.repeat(64),
}

// a hand-written finding for one package version and advisory group
function createFinding({
  packageName,
  version,
  advisoryId,
  aliases = [],
}: CreateFindingOptions): DependencyFinding {
  return {
    packageName,
    installedPackageName: packageName,
    version,
    advisoryId,
    aliases,
    severity: 'high',
    confidence: 0.9,
    isGithubReviewed: true,
    dependencyScope: 'prod',
    isVersionUnparseable: false,
    isIntroducedByPullRequest: false,
    fixedVersions: [],
    matcherAgreement: 'oracle-unavailable',
  }
}

// index the advisories under every normalized name they affect, the shape the advisories module writes
function createAdvisoryIndex(
  advisories: Advisory[],
): Record<string, Advisory[]> {
  const advisoryIndex: Record<string, Advisory[]> = {}
  for (const advisory of advisories) {
    const affectedNames = new Set(
      advisory.affected.map((affectedPackage) =>
        normalizePackageName(affectedPackage.name),
      ),
    )
    for (const affectedName of affectedNames) {
      const packageAdvisories = advisoryIndex[affectedName] ?? []
      packageAdvisories.push(advisory)
      advisoryIndex[affectedName] = packageAdvisories
    }
  }
  return advisoryIndex
}

// write a throwaway tree: the advisory cache, the agreed case, a lockfile the parser rejects and one without a package.json
async function writeThrowawayTree(advisories: Advisory[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'validate-matcher-'))

  // the advisory cache holding the fixture advisories
  const { indexPath, snapshotPath } = resolveAdvisoryCachePaths({
    cacheDir: join(root, 'advisory-cache'),
    ecosystem: 'npm',
  })
  await Bun.write(indexPath, JSON.stringify(createAdvisoryIndex(advisories)))
  await Bun.write(
    snapshotPath,
    JSON.stringify({ ...throwawaySnapshot, entryCount: advisories.length }),
  )

  // the three cases
  await Bun.write(
    join(root, 'cases', 'agreed', 'package.json'),
    JSON.stringify(agreedCaseManifest),
  )
  await Bun.write(
    join(root, agreedCaseLockfilePath),
    JSON.stringify(agreedCaseLockfile),
  )
  await Bun.write(
    join(root, 'cases', 'unparseable', 'package.json'),
    JSON.stringify({ name: 'unparseable-app' }),
  )
  await Bun.write(
    join(root, 'cases', 'unparseable', 'package-lock.json'),
    JSON.stringify({ name: 'unparseable-app', lockfileVersion: 1 }),
  )
  await Bun.write(
    join(root, 'cases', 'no-manifest', 'package-lock.json'),
    JSON.stringify({ name: 'no-manifest-app', lockfileVersion: 3 }),
  )
  return root
}

// write a document whose rows accept exactly the given keys
function createAcceptedDocument(disagreementKeys: string[]): string {
  const acceptedRows = disagreementKeys.map(
    (disagreementKey) =>
      `| ${disagreementKey} | accepted | the file dependency is not a registry package |`,
  )
  return [
    '# Accepted disagreements',
    '',
    '| Lockfile | Package | Kind | Side | Ids | Ruling | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...acceptedRows,
  ].join('\n')
}

describe('validateMatcher', () => {
  // a throwaway tree with the fixture advisories as its cache and three case directories
  let root = ''
  beforeAll(async () => {
    root = await writeThrowawayTree(await readFixtureAdvisories())
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test.skipIf(!isOracleAvailable())(
    'Unaccepted disagreement: reports the file dependency both matchers name differently when no document accepts it',
    async () => {
      const validateMatcherResult = await validateMatcher({
        root,
        ...throwawayTreeOptions,
      })
      expect(
        validateMatcherResult.unacceptedDisagreements.map(toDisagreementKey),
      ).toEqual(agreedCaseDisagreementKeys)
    },
  )

  test.skipIf(!isOracleAvailable())(
    'Accepted disagreements only: reports nothing unaccepted when the document accepts every key, and both sides agree on the range-kit groups',
    async () => {
      await Bun.write(
        join(root, 'accepted-disagreements.md'),
        createAcceptedDocument(agreedCaseDisagreementKeys),
      )
      const validateMatcherResult = await validateMatcher({
        root,
        ...throwawayTreeOptions,
      })
      expect(validateMatcherResult.unacceptedDisagreements).toEqual([])
      const agreedCaseValidation = validateMatcherResult.validations.find(
        (lockfileValidation) =>
          lockfileValidation.lockfilePath === agreedCaseLockfilePath,
      )
      expect(agreedCaseValidation).toMatchObject({
        status: 'validated',
        packageCount: 2,
        findingCount: 2,
        oracleMatchCount: 2,
      })
    },
  )

  test.skipIf(!isOracleAvailable())(
    'skips a lockfile the parser rejects and one without a package.json beside it',
    async () => {
      const validateMatcherResult = await validateMatcher({
        root,
        ...throwawayTreeOptions,
      })
      const validationStatuses = validateMatcherResult.validations.map(
        (lockfileValidation) => [
          lockfileValidation.lockfilePath,
          lockfileValidation.status,
        ],
      )
      expect(validationStatuses).toEqual([
        [agreedCaseLockfilePath, 'validated'],
        ['cases/no-manifest/package-lock.json', 'skipped'],
        ['cases/unparseable/package-lock.json', 'skipped'],
      ])
    },
  )

  test('Oracle missing: rejects with the binary name when PATH holds no osv-scanner', async () => {
    // empty PATH so Bun.which finds nothing, and restore it whatever happens
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      await expect(
        validateMatcher({ root, ...throwawayTreeOptions }),
      ).rejects.toThrow('osv-scanner')
    } finally {
      process.env.PATH = originalPath
    }
  })

  test.skipIf(!isOracleAvailable())(
    'Every case recorded: finds no disagreement over the repository fixtures that docs/matcher-disagreements.md does not accept',
    async () => {
      const validateMatcherResult = await validateMatcher()
      expect(validateMatcherResult.unacceptedDisagreements).toEqual([])
    },
    60_000,
  )
})

describe('classifyDisagreements', () => {
  test('reports a package only one side saw as a package-set difference', () => {
    const disagreements = classifyDisagreements({
      lockfilePath: 'fixtures/bun.lock',
      dependencyVersions: [
        createDependencyVersion({ name: 'left-pad', version: '1.3.0' }),
        createDependencyVersion({
          name: 'git-kit',
          version: 'github:acme/git-kit#v1.0.0',
        }),
      ],
      handwrittenFindings: [],
      oraclePackages: [
        { packageName: 'left-pad', version: '1.3.0' },
        { packageName: 'https://github.com/acme/git-kit', version: '' },
      ],
      oracleMatches: [],
    })
    expect(disagreements.map(toDisagreementKey)).toEqual([
      'fixtures/bun.lock | git-kit@github:acme/git-kit#v1.0.0 | package-set | handwritten-only | -',
      'fixtures/bun.lock | https://github.com/acme/git-kit@ | package-set | oracle-only | -',
    ])
  })

  test('reports an advisory group without an overlapping group on the other side', () => {
    const disagreements = classifyDisagreements({
      lockfilePath: 'fixtures/package-lock.json',
      dependencyVersions: [
        createDependencyVersion({ name: 'lodash', version: '4.17.20' }),
      ],
      handwrittenFindings: [
        createFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-AAAA-0001',
          aliases: ['CVE-2024-0001'],
        }),
        createFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-BBBB-0002',
        }),
      ],
      oraclePackages: [{ packageName: 'lodash', version: '4.17.20' }],
      oracleMatches: [
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['CVE-2024-0001'],
        },
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['GHSA-CCCC-0003'],
        },
      ],
    })
    expect(disagreements.map(toDisagreementKey)).toEqual([
      'fixtures/package-lock.json | lodash@4.17.20 | advisory-set | handwritten-only | GHSA-BBBB-0002',
      'fixtures/package-lock.json | lodash@4.17.20 | advisory-set | oracle-only | GHSA-CCCC-0003',
    ])
  })

  test('keys an alias by its real package name and compares names case-insensitively', () => {
    const disagreements = classifyDisagreements({
      lockfilePath: 'fixtures/bun.lock',
      dependencyVersions: [
        createDependencyVersion({
          name: 'lodash-legacy',
          version: '4.17.20',
          realPackageName: 'lodash',
        }),
      ],
      handwrittenFindings: [
        createFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-AAAA-0001',
        }),
      ],
      oraclePackages: [{ packageName: 'Lodash', version: '4.17.20' }],
      oracleMatches: [
        {
          packageName: 'Lodash',
          version: '4.17.20',
          advisoryIds: ['GHSA-AAAA-0001'],
        },
      ],
    })
    expect(disagreements).toEqual([])
  })
})

describe('readAcceptedDisagreementKeys', () => {
  test('keeps the keys of accepted rows and skips fixed rows, the header and the separator', () => {
    const markdown = [
      '# Disagreements',
      '',
      '| Lockfile | Package | Kind | Side | Ids | Ruling | Reason |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| `fixtures/bun.lock` | `git-kit@github:acme/git-kit#v1.0.0` | package-set | handwritten-only | - | accepted | osv-scanner drops git dependencies |',
      '| `fixtures/package-lock.json` | `lodash@4.17.20` | advisory-set | oracle-only | GHSA-CCCC-0003 | fixed | the matcher ignored a range |',
      '',
      'Some prose with a | pipe in it.',
    ].join('\n')
    expect([...readAcceptedDisagreementKeys(markdown)]).toEqual([
      'fixtures/bun.lock | git-kit@github:acme/git-kit#v1.0.0 | package-set | handwritten-only | -',
    ])
  })

  test('accepts a ruling whatever its case or emphasis and ids whatever their spacing or order', () => {
    const markdown = [
      '| Lockfile | Package | Kind | Side | Ids | Ruling | Reason |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| `fixtures/a.lock` | `lodash@4.17.20` | advisory-set | oracle-only | GHSA-BBBB-0002,GHSA-AAAA-0001 | **Accepted** | emphasised and unspaced |',
      '| `fixtures/b.lock` | `lodash@4.17.20` | advisory-set | oracle-only | `GHSA-BBBB-0002` ,  `GHSA-AAAA-0001` | ACCEPTED | upper case and padded |',
      '| `fixtures/c.lock` | `lodash@4.17.20` | advisory-set | oracle-only | GHSA-AAAA-0001 | _rejected_ | not accepted |',
    ].join('\n')
    expect([...readAcceptedDisagreementKeys(markdown)]).toEqual([
      'fixtures/a.lock | lodash@4.17.20 | advisory-set | oracle-only | GHSA-AAAA-0001, GHSA-BBBB-0002',
      'fixtures/b.lock | lodash@4.17.20 | advisory-set | oracle-only | GHSA-AAAA-0001, GHSA-BBBB-0002',
    ])
  })

  test('Header row: skips the row above the separator even when its ruling cell reads accepted', () => {
    const markdown = [
      '| Lockfile | Package | Kind | Side | Ids | accepted | Reason |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    ].join('\n')
    expect([...readAcceptedDisagreementKeys(markdown)]).toEqual([])
  })
})

describe('listLockfilePaths', () => {
  // a throwaway tree with one lockfile of each kind and a decoy
  let root = ''
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'validate-matcher-'))
    await Bun.write(join(root, 'cases', 'one', 'bun.lock'), '{}')
    await Bun.write(join(root, 'cases', 'two', 'package-lock.json'), '{}')
    await Bun.write(join(root, 'cases', 'two', 'yarn.lock'), '')
  })
  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  test('lists supported lockfiles sorted and treats a missing root as empty', async () => {
    const lockfilePaths = await listLockfilePaths({
      root,
      roots: ['missing', 'cases'],
    })
    expect(lockfilePaths).toEqual([
      'cases/one/bun.lock',
      'cases/two/package-lock.json',
    ])
  })
})
