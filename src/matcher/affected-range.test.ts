// tests for the affected range match: every range semantics, event order and tie rules, prerelease ordering and unparseable version scenario, an unparseable event version, the fixed versions collected, a GIT range ignored and the version comparisons
import { describe, expect, test } from 'bun:test'
import type {
  AdvisoryRange,
  AdvisoryRangeEvent,
  AffectedPackage,
} from '@/shared/advisory'
import {
  compareCodeUnitOrder,
  compareVersionOrder,
  compareVersions,
  isVersionUnparseable,
  matchAffectedPackage,
  sortUniqueVersions,
} from './affected-range'

describe('matchAffectedPackage range semantics', () => {
  test('introduced zero and fixed: 4.17.20 is affected and 4.17.21 is not', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '0' }, { fixed: '4.17.21' }])],
    })
    expect(isVersionAffected({ version: '4.17.20', affectedPackage })).toBe(
      true,
    )
    expect(isVersionAffected({ version: '4.17.21', affectedPackage })).toBe(
      false,
    )
  })

  test('last affected: 1.2.0 is affected and 1.2.1 is not', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([{ introduced: '1.0.0' }, { lastAffected: '1.2.0' }]),
      ],
    })
    expect(isVersionAffected({ version: '1.2.0', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.2.1', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '0.9.0', affectedPackage })).toBe(false)
  })

  test('no upper event: 9.9.9 is affected and 1.9.9 is not', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '2.0.0' }])],
    })
    expect(isVersionAffected({ version: '9.9.9', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.9.9', affectedPackage })).toBe(false)
  })

  test('several ranges unioned: 1.0.2 and 2.0.1 are affected and 1.5.0 is not', () => {
    const affectedPackage = createTwoRangePackage()
    expect(isVersionAffected({ version: '1.0.2', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '2.0.1', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.5.0', affectedPackage })).toBe(false)
  })

  test('ecosystem range: 0.9.0 is affected by introduced 0 fixed 1.0.0', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        {
          type: 'ECOSYSTEM',
          events: [{ introduced: '0' }, { fixed: '1.0.0' }],
        },
      ],
    })
    expect(isVersionAffected({ version: '0.9.0', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.0.0', affectedPackage })).toBe(false)
  })

  test('events given out of order are sorted before the walk', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ fixed: '1.0.5' }, { introduced: '0' }])],
    })
    expect(isVersionAffected({ version: '1.0.2', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.0.5', affectedPackage })).toBe(false)
  })

  test('events in reverse document order still sort correctly when all parse', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([
          { fixed: '3.0.0' },
          { introduced: '2.0.0' },
          { fixed: '1.0.0' },
          { introduced: '0' },
        ]),
      ],
    })
    expect(isVersionAffected({ version: '0.5.0', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '1.5.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.5.0', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '3.0.0', affectedPackage })).toBe(false)
  })

  test('an event holding both introduced and fixed bounds its interval on both sides', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '1.0.0', fixed: '1.0.5' }])],
    })
    expect(matchAffectedPackage({ version: '1.0.2', affectedPackage })).toEqual(
      { isAffected: true, fixedVersions: ['1.0.5'], ignoredGitRangeCount: 0 },
    )
    expect(isVersionAffected({ version: '0.9.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.0.0', affectedPackage })).toBe(false)
  })

  test('equal introduced and fixed form an empty interval whatever the event order', () => {
    const forwardPackage = createAffectedPackage({
      ranges: [
        createSemverRange([{ introduced: '1.0.0' }, { fixed: '1.0.0' }]),
      ],
    })
    const reversedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([{ fixed: '1.0.0' }, { introduced: '1.0.0' }]),
      ],
    })
    for (const affectedPackage of [forwardPackage, reversedPackage]) {
      expect(isVersionAffected({ version: '1.0.0', affectedPackage })).toBe(
        false,
      )
      expect(isVersionAffected({ version: '2.0.0', affectedPackage })).toBe(
        false,
      )
    }
  })

  test('a repeated introduced 0 collapses into the first interval and still reports every fixed event', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([
          { introduced: '0' },
          { fixed: '1.0.0' },
          { introduced: '0' },
          { fixed: '2.0.0' },
        ]),
      ],
    })
    expect(matchAffectedPackage({ version: '0.5.0', affectedPackage })).toEqual(
      {
        isAffected: true,
        fixedVersions: ['1.0.0', '2.0.0'],
        ignoredGitRangeCount: 0,
      },
    )
    expect(isVersionAffected({ version: '1.5.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.0.0', affectedPackage })).toBe(false)
  })

  test('equal introduced and lastAffected cover exactly that version whatever the event order', () => {
    const forwardPackage = createAffectedPackage({
      ranges: [
        createSemverRange([{ introduced: '1.0.0' }, { lastAffected: '1.0.0' }]),
      ],
    })
    const reversedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([{ lastAffected: '1.0.0' }, { introduced: '1.0.0' }]),
      ],
    })
    for (const affectedPackage of [forwardPackage, reversedPackage]) {
      expect(isVersionAffected({ version: '1.0.0', affectedPackage })).toBe(
        true,
      )
      expect(isVersionAffected({ version: '0.9.0', affectedPackage })).toBe(
        false,
      )
      expect(isVersionAffected({ version: '1.0.1', affectedPackage })).toBe(
        false,
      )
    }
  })
})

describe('matchAffectedPackage prerelease ordering', () => {
  test('prerelease below fixed: 1.0.0-beta.1 is affected by introduced 0 fixed 1.0.0', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '0' }, { fixed: '1.0.0' }])],
    })
    expect(
      isVersionAffected({ version: '1.0.0-beta.1', affectedPackage }),
    ).toBe(true)
  })

  test('prerelease below introduced: 1.0.0-beta.1 is not affected by introduced 1.0.0', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '1.0.0' }])],
    })
    expect(
      isVersionAffected({ version: '1.0.0-beta.1', affectedPackage }),
    ).toBe(false)
  })
})

describe('matchAffectedPackage unparseable versions', () => {
  test('equal to a listed version: 1.0.0.1 matches the versions list by equality', () => {
    const affectedPackage = createAffectedPackage({
      versions: ['0.5.0', '1.0.0.1'],
    })
    expect(
      matchAffectedPackage({ version: '1.0.0.1', affectedPackage }),
    ).toEqual({ isAffected: true, fixedVersions: [], ignoredGitRangeCount: 0 })
    expect(isVersionAffected({ version: '1.0.0.2', affectedPackage })).toBe(
      false,
    )
  })

  test('not covered by a range: workspace:packages/utils is not covered by introduced 0 with no upper event', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '0' }])],
    })
    expect(
      isVersionAffected({
        version: 'workspace:packages/utils',
        affectedPackage,
      }),
    ).toBe(false)
  })

  test('an event version that fails to parse compares by string equality only', () => {
    // fixed 1.0.0.1 cannot be ordered against a parseable version. an undecided upper comparison counts as not affected
    const affectedPackage = createAffectedPackage({
      ranges: [createSemverRange([{ introduced: '0' }, { fixed: '1.0.0.1' }])],
    })
    expect(isVersionAffected({ version: '1.0.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.0.0', affectedPackage })).toBe(false)

    // introduced 0 never covers an unparseable version. 1.0.0.1 is not affected even though it equals the fixed event
    expect(isVersionAffected({ version: '1.0.0.1', affectedPackage })).toBe(
      false,
    )
  })

  test('an unparseable event among parseable ones keeps the events in document order', () => {
    // fixed next stays the upper bound of introduced 1.0.0. 1.5.0 cannot be decided and 2.5.0 is affected
    const affectedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([
          { introduced: '1.0.0' },
          { fixed: 'next' },
          { introduced: '2.0.0' },
          { fixed: '3.0.0' },
        ]),
      ],
    })
    expect(isVersionAffected({ version: '1.5.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.5.0', affectedPackage })).toBe(true)
    expect(isVersionAffected({ version: '3.0.0', affectedPackage })).toBe(false)
  })

  test('an unparseable fixed event under introduced 0 does not move to the end of the range', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        createSemverRange([
          { introduced: '0' },
          { fixed: '1.0.0.1' },
          { introduced: '2.0.0' },
          { fixed: '2.0.5' },
        ]),
      ],
    })
    expect(isVersionAffected({ version: '1.5.0', affectedPackage })).toBe(false)
    expect(isVersionAffected({ version: '2.0.3', affectedPackage })).toBe(true)
  })
})

describe('matchAffectedPackage fixed versions and GIT ranges', () => {
  test('fixedVersions collects only the fixed events of the ranges that matched', () => {
    const affectedPackage = createTwoRangePackage()
    expect(
      matchAffectedPackage({ version: '1.0.2', affectedPackage }).fixedVersions,
    ).toEqual(['1.0.5'])
    expect(
      matchAffectedPackage({ version: '2.0.1', affectedPackage }).fixedVersions,
    ).toEqual(['2.0.3'])
    expect(
      matchAffectedPackage({ version: '1.5.0', affectedPackage }).fixedVersions,
    ).toEqual([])
  })

  test('a GIT range is counted and ignored beside a SEMVER range', () => {
    const affectedPackage = createAffectedPackage({
      ranges: [
        {
          type: 'GIT',
          events: [
            { introduced: '0000000000000000000000000000000000000000' },
            { fixed: '1111111111111111111111111111111111111111' },
          ],
        },
        createSemverRange([{ introduced: '0' }, { fixed: '1.1.0' }]),
      ],
    })
    expect(matchAffectedPackage({ version: '1.0.0', affectedPackage })).toEqual(
      { isAffected: true, fixedVersions: ['1.1.0'], ignoredGitRangeCount: 1 },
    )
    expect(matchAffectedPackage({ version: '1.1.0', affectedPackage })).toEqual(
      { isAffected: false, fixedVersions: [], ignoredGitRangeCount: 1 },
    )
  })
})

describe('compareVersions', () => {
  test('returns 0 for equal strings, even unparseable ones', () => {
    expect(compareVersions({ first: '1.0.0', second: '1.0.0' })).toBe(0)
    expect(compareVersions({ first: '1.0.0.1', second: '1.0.0.1' })).toBe(0)
  })

  test('orders parseable versions with prerelease precedence', () => {
    expect(compareVersions({ first: '1.0.0', second: '2.0.0' })).toBe(-1)
    expect(compareVersions({ first: '1.10.0', second: '1.9.0' })).toBe(1)
    expect(compareVersions({ first: '1.0.0-beta.1', second: '1.0.0' })).toBe(-1)
  })

  test('returns undefined when either version does not parse', () => {
    expect(compareVersions({ first: '1.0.0', second: '1.0.0.1' })).toBe(
      undefined,
    )
    expect(
      compareVersions({ first: 'workspace:packages/utils', second: '1.0.0' }),
    ).toBe(undefined)
  })

  test('ignores build metadata as semver precedence does', () => {
    expect(compareVersions({ first: '1.0.0+a', second: '1.0.0+b' })).toBe(0)
    expect(compareVersions({ first: '1.0.0+a', second: '1.0.0' })).toBe(0)
  })
})

describe('version order helpers', () => {
  test('isVersionUnparseable reports what semver rejects', () => {
    expect(isVersionUnparseable('1.0.0')).toBe(false)
    expect(isVersionUnparseable('1.0.0-beta.1')).toBe(false)
    expect(isVersionUnparseable('1.0.0.1')).toBe(true)
    expect(isVersionUnparseable('workspace:packages/utils')).toBe(true)
  })

  test('compareVersionOrder puts parseable versions first and the rest in code unit order', () => {
    expect(compareVersionOrder({ first: '1.0.0', second: '1.0.0.1' })).toBe(-1)
    expect(compareVersionOrder({ first: '1.0.0.1', second: '1.0.0' })).toBe(1)
    expect(compareVersionOrder({ first: 'b', second: 'a' })).toBe(1)
    expect(compareVersionOrder({ first: '2.0.0', second: '10.0.0' })).toBe(-1)
  })

  test('compareVersionOrder breaks a build metadata tie by code units whatever the input order', () => {
    expect(compareVersionOrder({ first: '1.0.0+a', second: '1.0.0+b' })).toBe(
      -1,
    )
    expect(compareVersionOrder({ first: '1.0.0+b', second: '1.0.0+a' })).toBe(1)
    expect(compareVersionOrder({ first: '1.0.0', second: '1.0.0+a' })).toBe(-1)
    expect(sortUniqueVersions(['1.0.0+b', '1.0.0+a', '1.0.0'])).toEqual(
      sortUniqueVersions(['1.0.0', '1.0.0+a', '1.0.0+b']),
    )
    expect(sortUniqueVersions(['1.0.0+b', '1.0.0+a', '1.0.0'])).toEqual([
      '1.0.0',
      '1.0.0+a',
      '1.0.0+b',
    ])
  })

  test('compareCodeUnitOrder orders strings as a plain comparison does', () => {
    expect(compareCodeUnitOrder({ first: 'a', second: 'b' })).toBe(-1)
    expect(compareCodeUnitOrder({ first: 'b', second: 'a' })).toBe(1)
    expect(compareCodeUnitOrder({ first: 'a', second: 'a' })).toBe(0)
  })

  test('sortUniqueVersions deduplicates and sorts in version order', () => {
    expect(
      sortUniqueVersions(['2.0.0', '1.0.0.1', '1.0.0', '1.0.0', '10.0.0']),
    ).toEqual(['1.0.0', '2.0.0', '10.0.0', '1.0.0.1'])
  })
})

// the ranges and listed versions of a test affected package, both empty unless given
interface CreateAffectedPackageOptions {
  ranges?: AdvisoryRange[]
  versions?: string[]
}

// the version and the entry to ask about
interface IsVersionAffectedOptions {
  version: string
  affectedPackage: AffectedPackage
}

// create an npm affected entry for test-kit with the given ranges and listed versions
function createAffectedPackage({
  ranges = [],
  versions = [],
}: CreateAffectedPackageOptions): AffectedPackage {
  return { ecosystem: 'npm', name: 'test-kit', ranges, versions }
}

// create a SEMVER range over the given events
function createSemverRange(events: AdvisoryRangeEvent[]): AdvisoryRange {
  return { type: 'SEMVER', events }
}

// create an entry with a range 1.0.0 to fixed 1.0.5 and a range 2.0.0 to fixed 2.0.3
function createTwoRangePackage(): AffectedPackage {
  return createAffectedPackage({
    ranges: [
      createSemverRange([{ introduced: '1.0.0' }, { fixed: '1.0.5' }]),
      createSemverRange([{ introduced: '2.0.0' }, { fixed: '2.0.3' }]),
    ],
  })
}

// read only whether the entry covers the version
function isVersionAffected({
  version,
  affectedPackage,
}: IsVersionAffectedOptions): boolean {
  return matchAffectedPackage({ version, affectedPackage }).isAffected
}
