// tests for lockfile detection and parsing: every fixture case in both formats, snapshots of the sorted projection, rejected versions and malformed text, and determinism
import { describe, expect, test } from 'bun:test'
import {
  type DependencySet,
  type DependencyVersion,
  lockfileKinds,
} from '@/shared/dependency'
import {
  readFixtureContent,
  readFixtureDependencySet,
  sharedFixtureCases,
} from './lockfile-fixtures'
import { LockfileParseError } from './lockfile-parse-error'
import { detectLockfiles, parseLockfile } from './lockfile-registry'
import { toSortedDependencyVersions } from './sorted-dependency-versions'

describe('detectLockfiles', () => {
  test('reports supported and unsupported lockfiles and skips other paths', () => {
    const detectedLockfiles = detectLockfiles([
      'bun.lock',
      'web/package-lock.json',
      'pnpm-lock.yaml',
      'apps/yarn.lock',
      'src/index.ts',
      'docs/bun.lock.md',
    ])
    expect(detectedLockfiles).toEqual([
      { status: 'supported', path: 'bun.lock', lockfileKind: 'bun' },
      {
        status: 'supported',
        path: 'web/package-lock.json',
        lockfileKind: 'npm',
      },
      {
        status: 'unsupported',
        path: 'pnpm-lock.yaml',
        fileName: 'pnpm-lock.yaml',
      },
      { status: 'unsupported', path: 'apps/yarn.lock', fileName: 'yarn.lock' },
    ])
  })
})

describe.each(lockfileKinds)(
  'parseLockfile with the %s lockfile',
  (lockfileKind) => {
    test('keeps every version of a package and nested scoped copies', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'scoped-multi-version',
      })

      // both versions of each package appear and only the top level copy is direct
      const leftPadVersions = dependencySet.versionsByDependency.get('left-pad')
      expect(leftPadVersions?.map((version) => version.version)).toEqual([
        '1.1.3',
        '1.3.0',
      ])
      expect(
        findDependencyVersion(dependencySet, 'left-pad@1.3.0').isDirect,
      ).toBe(true)
      expect(
        findDependencyVersion(dependencySet, 'left-pad@1.1.3').isDirect,
      ).toBe(false)

      // the scoped package depends on the nested copies
      const loggerVersion = findDependencyVersion(
        dependencySet,
        '@acme/logger@2.1.0',
      )
      expect(loggerVersion.dependencyKeys).toEqual([
        '@acme/format@1.0.4',
        'left-pad@1.1.3',
      ])
      expect(toSortedDependencyVersions(dependencySet)).toMatchSnapshot()
    })

    test('marks dev only, shared, optional and peer dependencies', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'scopes',
      })

      // what the dev dependency alone reaches is dev, what production also reaches is prod
      expect(
        findDependencyVersion(dependencySet, 'test-runner@2.1.0').scope,
      ).toBe('dev')
      expect(
        findDependencyVersion(dependencySet, 'assert-kit@1.4.0').scope,
      ).toBe('dev')
      expect(
        findDependencyVersion(dependencySet, 'deep-equal-kit@1.0.0').scope,
      ).toBe('dev')
      expect(
        findDependencyVersion(dependencySet, 'shared-util@1.0.2').scope,
      ).toBe('prod')

      // optional and peer dependencies of the root are direct and prod, a missing optional peer is skipped
      for (const dependencyKey of ['native-watch@1.0.1', 'view-kit@18.2.0']) {
        expect(
          findDependencyVersion(dependencySet, dependencyKey),
        ).toMatchObject({
          scope: 'prod',
          isDirect: true,
        })
      }
      expect(
        findDependencyVersion(dependencySet, 'web-server@1.2.0').dependencyKeys,
      ).toEqual(['fast-json@3.1.0', 'shared-util@1.0.2', 'view-kit@18.2.0'])
      expect([...dependencySet.directDependencyNames]).toEqual([
        'native-watch',
        'test-runner',
        'view-kit',
        'web-server',
      ])
      expect(toSortedDependencyVersions(dependencySet)).toMatchSnapshot()
    })

    test('keeps the real package name of an npm alias', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'alias',
      })
      expect(
        findDependencyVersion(dependencySet, 'lodash-legacy@4.17.20'),
      ).toMatchObject({
        realPackageName: 'lodash',
        isDirect: true,
      })
      expect(
        findDependencyVersion(dependencySet, 'lodash@4.17.21').realPackageName,
      ).toBeUndefined()
      expect(toSortedDependencyVersions(dependencySet)).toMatchSnapshot()
    })

    test('marks workspace packages and walks their dependencies', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'workspace',
      })

      // the workspace packages are flagged and keep their path as the version
      expect(
        findDependencyVersion(
          dependencySet,
          '@acme/utils@workspace:packages/utils',
        ),
      ).toMatchObject({
        isWorkspace: true,
        isVersionUnparseable: true,
        dependencyKeys: ['left-pad@1.3.0'],
      })
      expect(
        findDependencyVersion(dependencySet, 'web@workspace:packages/web')
          .dependencyKeys,
      ).toEqual(['@acme/utils@workspace:packages/utils'])

      // a workspace dev dependency is dev, and only the root decides what is direct
      expect(
        findDependencyVersion(dependencySet, 'test-runner@2.1.0').scope,
      ).toBe('dev')
      expect([...dependencySet.directDependencyNames]).toEqual(['left-pad'])
      expect(toSortedDependencyVersions(dependencySet)).toMatchSnapshot()
    })

    test('keeps git, file, link and tarball specifiers as unparseable versions', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'specifiers',
      })

      // every specifier dependency is direct, not a workspace and unparseable
      const specifierVersions = toSortedDependencyVersions(
        dependencySet,
      ).filter((dependencyVersion) => dependencyVersion.name !== 'left-pad')
      expect(specifierVersions.length).toBeGreaterThanOrEqual(3)
      for (const specifierVersion of specifierVersions) {
        expect(specifierVersion).toMatchObject({
          isDirect: true,
          isWorkspace: false,
          isVersionUnparseable: true,
        })
      }

      // the git dependency keeps its source string and its own dependencies
      const gitKitVersions =
        dependencySet.versionsByDependency.get('git-kit') ?? []
      expect(gitKitVersions[0]?.version).toMatch(/acme\/git-kit.*#4f2a9c1$/)
      expect(gitKitVersions[0]?.dependencyKeys).toEqual(['left-pad@1.3.0'])
      expect(
        findDependencyVersion(dependencySet, 'left-pad@1.3.0')
          .isVersionUnparseable,
      ).toBe(false)
      expect(toSortedDependencyVersions(dependencySet)).toMatchSnapshot()
    })

    test('parsing the same file twice gives deep-equal results in the same order', async () => {
      const fixtureContent = await readFixtureContent({
        lockfileKind,
        fixtureCase: 'scopes',
      })
      const parseOptions = {
        content: fixtureContent.content,
        lockfileKind,
        lockfilePath: fixtureContent.lockfileFileName,
        rootPackageJson: fixtureContent.rootPackageJson,
      }
      const firstDependencySet = parseLockfile(parseOptions)
      const secondDependencySet = parseLockfile(parseOptions)
      expect(secondDependencySet).toEqual(firstDependencySet)

      // compare the serialized projections so the order is checked too
      expect(
        JSON.stringify(toSortedDependencyVersions(secondDependencySet)),
      ).toBe(JSON.stringify(toSortedDependencyVersions(firstDependencySet)))
    })

    test('rejects malformed text and a malformed root package.json', () => {
      const malformedLockfileError = catchLockfileParseError(() =>
        parseLockfile({
          content: '{ "lockfileVersion": ',
          lockfileKind,
          lockfilePath: 'broken',
          rootPackageJson: '{}',
        }),
      )
      expect(malformedLockfileError).toMatchObject({
        lockfileKind,
        reason: 'malformed',
      })
      const malformedManifestError = catchLockfileParseError(() =>
        parseLockfile({
          content: '{}',
          lockfileKind,
          lockfilePath: 'broken',
          rootPackageJson: '{ "dependencies": [] }',
        }),
      )
      expect(malformedManifestError.reason).toBe('malformed')
    })
  },
)

describe('parseLockfile across formats', () => {
  test.each(
    sharedFixtureCases.filter((fixtureCase) => fixtureCase !== 'specifiers'),
  )(
    'the %s case gives the same projection from bun.lock and package-lock.json',
    async (fixtureCase) => {
      const bunDependencySet = await readFixtureDependencySet({
        lockfileKind: 'bun',
        fixtureCase,
      })
      const npmDependencySet = await readFixtureDependencySet({
        lockfileKind: 'npm',
        fixtureCase,
      })
      expect(toSortedDependencyVersions(npmDependencySet)).toEqual(
        toSortedDependencyVersions(bunDependencySet),
      )
    },
  )
})

describe('parseLockfile versions', () => {
  test('rejects package-lock.json version 1 with a typed error', async () => {
    const fixtureContent = await readFixtureContent({
      lockfileKind: 'npm',
      fixtureCase: 'lockfile-v1',
    })
    const unsupportedVersionError = catchLockfileParseError(() =>
      parseLockfile({
        content: fixtureContent.content,
        lockfileKind: 'npm',
        lockfilePath: 'package-lock.json',
        rootPackageJson: fixtureContent.rootPackageJson,
      }),
    )
    expect(unsupportedVersionError).toBeInstanceOf(LockfileParseError)
    expect(unsupportedVersionError).toMatchObject({
      lockfileKind: 'npm',
      reason: 'unsupported-version',
    })
    expect(unsupportedVersionError.message).toContain('lockfileVersion 1')
  })

  test('reads package-lock.json version 2', async () => {
    const fixtureContent = await readFixtureContent({
      lockfileKind: 'npm',
      fixtureCase: 'scoped-multi-version',
    })
    expect(JSON.parse(fixtureContent.content).lockfileVersion).toBe(2)
  })

  test('rejects a bun.lock version it does not know', () => {
    const unsupportedVersionError = catchLockfileParseError(() =>
      parseLockfile({
        content: '{ "lockfileVersion": 9, "packages": {}, }',
        lockfileKind: 'bun',
        lockfilePath: 'bun.lock',
        rootPackageJson: '{}',
      }),
    )
    expect(unsupportedVersionError).toMatchObject({
      lockfileKind: 'bun',
      reason: 'unsupported-version',
    })
  })
})

describe('parseLockfile names', () => {
  test('keeps two names that differ only in case as two packages', async () => {
    const dependencySet = await readFixtureDependencySet({
      lockfileKind: 'npm',
      fixtureCase: 'case-variant-names',
    })
    expect([...dependencySet.versionsByDependency.keys()]).toEqual([
      'JSONStream',
      'jsonstream',
    ])
    expect(findDependencyVersion(dependencySet, 'JSONStream@1.3.5').name).toBe(
      'JSONStream',
    )
    expect(findDependencyVersion(dependencySet, 'jsonstream@1.0.3').name).toBe(
      'jsonstream',
    )
  })
})

// find the one version of a package in a set, failing the test when it is missing
function findDependencyVersion(
  dependencySet: DependencySet,
  dependencyKey: string,
): DependencyVersion {
  const dependencyVersion = toSortedDependencyVersions(dependencySet).find(
    (candidate) => `${candidate.name}@${candidate.version}` === dependencyKey,
  )
  if (!dependencyVersion) {
    throw new Error(`${dependencyKey} is not in the dependency set`)
  }
  return dependencyVersion
}

// parse text that should fail and return the error it throws
function catchLockfileParseError(parse: () => unknown): LockfileParseError {
  try {
    parse()
  } catch (error) {
    if (error instanceof LockfileParseError) {
      return error
    }
    throw error
  }
  throw new Error('the lockfile parsed without an error')
}
