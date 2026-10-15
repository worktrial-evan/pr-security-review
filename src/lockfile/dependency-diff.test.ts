// tests for the dependency diff: one added, one bumped and one removed package in both formats, an unchanged set, and a second version reported as added
import { describe, expect, test } from 'bun:test'
import {
  type DependencySet,
  type DependencyVersion,
  dependencyDiffSchema,
  lockfileKinds,
} from '@/shared/dependency'
import { diffDependencySets } from './dependency-diff'
import { readFixtureDependencySet } from './lockfile-fixtures'

describe.each(lockfileKinds)(
  'diffDependencySets with the %s lockfile',
  (lockfileKind) => {
    test('reports one added, one bumped and one removed dependency', async () => {
      // diff the base and head fixtures
      const dependencyDiff = diffDependencySets({
        baseDependencySet: await readFixtureDependencySet({
          lockfileKind,
          fixtureCase: 'diff-base',
        }),
        headDependencySet: await readFixtureDependencySet({
          lockfileKind,
          fixtureCase: 'diff-head',
        }),
      })

      // the diff names each package once and parses against the contract
      expect(
        dependencyDiff.added.map(({ name, version }) => `${name}@${version}`),
      ).toEqual(['delta-kit@1.0.0'])
      expect(
        dependencyDiff.removed.map(({ name, version }) => `${name}@${version}`),
      ).toEqual(['charlie-kit@1.0.0'])
      expect(dependencyDiff.changed).toEqual([
        { name: 'bravo-kit', fromVersion: '2.0.0', toVersion: '2.1.0' },
      ])
      expect(dependencyDiff.unchangedCount).toBe(1)
      expect(dependencyDiffSchema.parse(dependencyDiff)).toEqual(dependencyDiff)
    })

    test('reports nothing between a set and itself', async () => {
      const dependencySet = await readFixtureDependencySet({
        lockfileKind,
        fixtureCase: 'scoped-multi-version',
      })
      expect(
        diffDependencySets({
          baseDependencySet: dependencySet,
          headDependencySet: dependencySet,
        }),
      ).toEqual({
        added: [],
        removed: [],
        changed: [],
        unchangedCount: 5,
      })
    })
  },
)

describe('diffDependencySets with several versions of one package', () => {
  test('reports a second version as added, not as a change', () => {
    // the head keeps left-pad 1.3.0 and adds a nested 1.1.3
    const baseDependencySet = createDependencySet([
      createLeftPadVersion('1.3.0'),
    ])
    const headDependencySet = createDependencySet([
      createLeftPadVersion('1.1.3'),
      createLeftPadVersion('1.3.0'),
    ])
    const dependencyDiff = diffDependencySets({
      baseDependencySet,
      headDependencySet,
    })
    expect(dependencyDiff.added.map(({ version }) => version)).toEqual([
      '1.1.3',
    ])
    expect(dependencyDiff.changed).toEqual([])
    expect(dependencyDiff.unchangedCount).toBe(1)
  })
})

// create a left-pad version with no dependencies
function createLeftPadVersion(version: string): DependencyVersion {
  return {
    name: 'left-pad',
    version,
    scope: 'prod',
    isDirect: false,
    isWorkspace: false,
    isVersionUnparseable: false,
    dependencyKeys: [],
  }
}

// create a bun dependency set holding the given left-pad versions
function createDependencySet(
  leftPadVersions: DependencyVersion[],
): DependencySet {
  return {
    lockfileKind: 'bun',
    lockfilePath: 'bun.lock',
    versionsByDependency: new Map([['left-pad', leftPadVersions]]),
    directDependencyNames: new Set(),
  }
}
