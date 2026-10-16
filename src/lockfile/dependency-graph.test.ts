// tests for the dependency graph: a transitive path, a direct target, a nested copy, a match by real package name and an unreachable package
import { describe, expect, test } from 'bun:test'
import { type DependencySet, lockfileKinds } from '@/shared/dependency'
import { buildDependencyGraph } from './dependency-graph'
import { readFixtureDependencySet } from './lockfile-fixtures'

describe.each(lockfileKinds)(
  'buildDependencyGraph with the %s lockfile',
  (lockfileKind) => {
    test('finds the path to a transitive dependency through the development dependency', async () => {
      const dependencyGraph = buildDependencyGraph(
        await readFixtureDependencySet({ lockfileKind, fixtureCase: 'scopes' }),
      )
      expect(dependencyGraph.shortestPathTo('deep-equal-kit')).toEqual([
        'test-runner@2.1.0',
        'assert-kit@1.4.0',
        'deep-equal-kit@1.0.0',
      ])
    })

    test('returns a direct dependency alone and an unreachable name as empty', async () => {
      const dependencyGraph = buildDependencyGraph(
        await readFixtureDependencySet({ lockfileKind, fixtureCase: 'scopes' }),
      )
      expect(dependencyGraph.shortestPathTo('web-server')).toEqual([
        'web-server@1.2.0',
      ])
      expect(dependencyGraph.shortestPathTo('missing-peer')).toEqual([])
    })

    test('reaches the top level copy before a nested copy of the same package', async () => {
      const dependencyGraph = buildDependencyGraph(
        await readFixtureDependencySet({
          lockfileKind,
          fixtureCase: 'scoped-multi-version',
        }),
      )
      expect(dependencyGraph.shortestPathTo('left-pad')).toEqual([
        'left-pad@1.3.0',
      ])
    })
  },
)

describe('buildDependencyGraph with an alias', () => {
  test('matches a package by its real package name', () => {
    // a set where lodash is installed only under an alias, below a direct dependency
    const dependencySet: DependencySet = {
      lockfileKind: 'npm',
      lockfilePath: 'package-lock.json',
      versionsByDependency: new Map([
        [
          'app-kit',
          [
            {
              name: 'app-kit',
              version: '1.0.0',
              scope: 'production',
              isDirect: true,
              isWorkspace: false,
              isVersionUnparseable: false,
              dependencyKeys: ['lodash-legacy@4.17.20'],
            },
          ],
        ],
        [
          'lodash-legacy',
          [
            {
              name: 'lodash-legacy',
              version: '4.17.20',
              scope: 'production',
              isDirect: false,
              isWorkspace: false,
              isVersionUnparseable: false,
              realPackageName: 'lodash',
              dependencyKeys: [],
            },
          ],
        ],
      ]),
      directDependencyNames: new Set(['app-kit']),
    }
    expect(
      buildDependencyGraph(dependencySet).shortestPathTo('lodash'),
    ).toEqual(['app-kit@1.0.0', 'lodash-legacy@4.17.20'])
  })
})
