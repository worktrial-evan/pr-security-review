// tests for the dependency contract: a set with two versions of one package keeps its map and set contents, and a diff round-trips
import { describe, expect, test } from 'bun:test'
import {
  type DependencyDiff,
  type DependencySet,
  type DependencyVersion,
  dependencyDiffSchema,
  dependencySetSchema,
} from './dependency'

// the two semver versions a lockfile can hold at once
const semverSixSample: DependencyVersion = {
  name: 'semver',
  version: '6.3.1',
  scope: 'production',
  isDirect: false,
  isWorkspace: false,
  isVersionUnparseable: false,
  dependencyKeys: [],
}
const semverSevenSample: DependencyVersion = {
  name: 'semver',
  version: '7.8.5',
  scope: 'production',
  isDirect: true,
  isWorkspace: false,
  isVersionUnparseable: false,
  dependencyKeys: [],
}

// a direct dependency that pulls in the older semver
const dependencyWithOlderSemverSample: DependencyVersion = {
  name: 'string-width-cjs',
  version: '4.2.3',
  scope: 'development',
  isDirect: true,
  isWorkspace: false,
  isVersionUnparseable: false,
  realPackageName: 'string-width',
  dependencyKeys: ['semver@6.3.1'],
}

// a bun lockfile holding both semver versions
const dependencySetSample: DependencySet = {
  lockfileKind: 'bun',
  lockfilePath: 'bun.lock',
  versionsByDependency: new Map([
    ['semver', [semverSixSample, semverSevenSample]],
    ['string-width-cjs', [dependencyWithOlderSemverSample]],
  ]),
  directDependencyNames: new Set(['semver', 'string-width-cjs']),
}

// a diff where semver was bumped and the alias was added
const dependencyDiffSample: DependencyDiff = {
  added: [dependencyWithOlderSemverSample],
  removed: [],
  changed: [{ name: 'semver', fromVersion: '7.8.4', toVersion: '7.8.5' }],
  unchangedCount: 11,
}

describe('dependencySetSchema', () => {
  test('a set with two versions of one package round-trips with map and set contents intact', () => {
    // parse the set and read both versions and the direct names back
    const parsedDependencySet = dependencySetSchema.parse(dependencySetSample)
    expect(parsedDependencySet).toEqual(dependencySetSample)
    expect(parsedDependencySet.versionsByDependency.get('semver')).toHaveLength(
      2,
    )
    expect(parsedDependencySet.directDependencyNames.has('semver')).toBe(true)
  })
})

describe('dependencyDiffSchema', () => {
  test('a diff round-trips', () => {
    expect(dependencyDiffSchema.parse(dependencyDiffSample)).toEqual(
      dependencyDiffSample,
    )
  })
})
