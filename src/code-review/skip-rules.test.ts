// tests the skip rules: each reason, hunks without an added line, the order of the checks, a plain source file kept, and the lockfile and generated path patterns
import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '@/shared/pull-request-source'
import {
  binaryChangedFile,
  deletedChangedFile,
  generatedChangedFile,
  lockfileChangedFile,
  removedOnlyChangedFile,
  sqlInjectionChangedFile,
} from './fixtures/changed-files'
import { findSkipReason, skipReasons } from './skip-rules'

// return the sql injection fixture with some fields replaced
function buildChangedFile(overrides: Partial<ChangedFile>): ChangedFile {
  return { ...sqlInjectionChangedFile, ...overrides }
}

describe('skipReasons', () => {
  test('lists the five reasons in check order', () => {
    expect(skipReasons).toEqual([
      'binary',
      'deleted',
      'lockfile',
      'generated',
      'no-added-lines',
    ])
  })
})

describe('findSkipReason', () => {
  test('returns null for a modified source file with added lines', () => {
    expect(findSkipReason(sqlInjectionChangedFile)).toBeNull()
  })

  test('reports binary for a binary file', () => {
    expect(findSkipReason(binaryChangedFile)).toBe('binary')
  })

  test('reports deleted for a deleted file', () => {
    expect(findSkipReason(deletedChangedFile)).toBe('deleted')
  })

  test('reports lockfile for bun.lock', () => {
    expect(findSkipReason(lockfileChangedFile)).toBe('lockfile')
  })

  test('reports generated for dist/app.min.js', () => {
    expect(findSkipReason(generatedChangedFile)).toBe('generated')
  })

  test('reports no-added-lines for a file whose hunks only remove lines', () => {
    expect(findSkipReason(removedOnlyChangedFile)).toBe('no-added-lines')
  })

  test('reports no-added-lines for an added file with no lines', () => {
    const emptyChangedFile = buildChangedFile({
      path: 'src/empty.ts',
      status: 'added',
      hunks: [],
      addedLines: [],
    })

    expect(findSkipReason(emptyChangedFile)).toBe('no-added-lines')
  })

  test('reports no-added-lines for a file that lists added lines but whose hunks hold none', () => {
    const staleAddedLinesChangedFile = buildChangedFile({
      hunks: removedOnlyChangedFile.hunks,
    })

    expect(findSkipReason(staleAddedLinesChangedFile)).toBe('no-added-lines')
  })

  test('reports no-added-lines for a file that lists added lines but has no hunks', () => {
    const noHunkChangedFile = buildChangedFile({ hunks: [] })

    expect(findSkipReason(noHunkChangedFile)).toBe('no-added-lines')
  })
})

describe('findSkipReason order', () => {
  test('reports binary for a deleted binary file', () => {
    const deletedBinaryChangedFile = buildChangedFile({
      ...binaryChangedFile,
      status: 'deleted',
    })

    expect(findSkipReason(deletedBinaryChangedFile)).toBe('binary')
  })

  test('reports deleted for a deleted lockfile', () => {
    const deletedLockfileChangedFile = buildChangedFile({
      ...deletedChangedFile,
      path: 'yarn.lock',
    })

    expect(findSkipReason(deletedLockfileChangedFile)).toBe('deleted')
  })

  test('reports lockfile for a generated lockfile path with no added lines', () => {
    const vendoredLockfileChangedFile = buildChangedFile({
      ...removedOnlyChangedFile,
      path: 'vendor/package-lock.json',
    })

    expect(findSkipReason(vendoredLockfileChangedFile)).toBe('lockfile')
  })

  test('reports generated for a generated file with no added lines', () => {
    const removedOnlyGeneratedChangedFile = buildChangedFile({
      ...removedOnlyChangedFile,
      path: 'build/output.js',
    })

    expect(findSkipReason(removedOnlyGeneratedChangedFile)).toBe('generated')
  })
})

describe('findSkipReason lockfile names', () => {
  test.each([
    'package-lock.json',
    'services/api/npm-shrinkwrap.json',
    'packages/web/yarn.lock',
    'pnpm-lock.yaml',
    'native/Cargo.lock',
    'Gemfile.lock',
    'poetry.lock',
    'composer.lock',
    'Pipfile.lock',
    'go.sum',
    'test/fixtures/bun/bun.lockb',
  ])('reports lockfile for %s', (path) => {
    expect(findSkipReason(buildChangedFile({ path }))).toBe('lockfile')
  })

  test('keeps a source file whose name only contains a lockfile name', () => {
    expect(
      findSkipReason(buildChangedFile({ path: 'src/lockfile/go.sum.ts' })),
    ).toBeNull()
  })
})

describe('findSkipReason generated paths', () => {
  test.each([
    ['a __snapshots__ segment', 'src/lockfile/__snapshots__/registry.txt'],
    ['a dist segment', 'packages/web/dist/index.js'],
    ['a node_modules segment', 'node_modules/left-pad/index.js'],
    ['a build segment', 'build/server.js'],
    ['a vendor segment', 'vendor/jquery.js'],
    ['a __generated__ segment', 'src/__generated__/schema.ts'],
    ['a .min.js name', 'public/app.min.js'],
    ['a .min.css name', 'public/styles.min.css'],
    ['a .map name', 'public/app.js.map'],
    ['a .snap name', 'src/report/report.test.ts.snap'],
    ['a .pb.go name', 'internal/api/service.pb.go'],
    ['a _pb2.py name', 'api/service_pb2.py'],
    ['a .generated. name', 'src/schema.generated.ts'],
  ])('reports generated for %s', (_description, path) => {
    expect(findSkipReason(buildChangedFile({ path }))).toBe('generated')
  })

  test('keeps a path whose segments only start with a generated segment name', () => {
    expect(
      findSkipReason(
        buildChangedFile({ path: 'src/distribution/build-report.ts' }),
      ),
    ).toBeNull()
  })

  test('keeps a name that only contains a generated suffix in the middle', () => {
    expect(
      findSkipReason(buildChangedFile({ path: 'src/map.min.js.ts' })),
    ).toBeNull()
  })
})
