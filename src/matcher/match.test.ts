// tests for the hand-written matcher over the fixture advisories and inline advisory sets: one finding per package version and alias group, the pull request flag, ecosystem and name filtering, listed versions, fixed versions, unparseable versions, withdrawn advisories, duplicated store entries, GIT ranges, severity and confidence, and the finding fields
import { describe, expect, test } from 'bun:test'
import type {
  Advisory,
  AdvisoryRangeEvent,
  AffectedPackage,
} from '@/shared/advisory'
import type { DependencyDiff, DependencyVersion } from '@/shared/dependency'
import type { MatchDependenciesResult } from './dependency-finding'
import { matchDependencies } from './match'
import {
  createDependencySet,
  createDependencyVersion,
  createEmptyDependencyDiff,
  createFixtureAdvisoryStore,
  readFixtureAdvisories,
} from './matcher-fixtures'

// the id, aliases, score, withdrawn timestamp and affected entries of an inline advisory
interface CreateAdvisoryOptions {
  id: string
  affected: AffectedPackage[]
  aliases?: string[]
  severityScore?: number
  withdrawn?: string
}

// the name of an affected entry, the events of its one SEMVER range and its ecosystem, npm unless given
interface CreateAffectedPackageOptions {
  name: string
  events: AdvisoryRangeEvent[]
  ecosystem?: string
}

// the fixture store every fixture test matches against
const advisoryStore = createFixtureAdvisoryStore(await readFixtureAdvisories())

// the timestamp a withdrawn inline advisory carries
const withdrawnAt = '2024-03-01T00:00:00Z'

// the one event list that covers every parseable version
const coverEveryVersion: AdvisoryRangeEvent[] = [{ introduced: '0' }]

describe('matchDependencies one finding per package version and alias group', () => {
  test('aliased advisories merge: a CVE advisory that lists the GHSA id as its alias merges with the GHSA advisory that lists nothing', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-MERG-0001',
        severityScore: 5,
        affected: [
          createAffectedPackage({
            name: 'merge-kit',
            events: [{ introduced: '0' }, { fixed: '1.0.9' }],
          }),
        ],
      }),
      createAdvisory({
        id: 'CVE-2024-0300',
        aliases: ['GHSA-MERG-0001'],
        affected: [
          createAffectedPackage({
            name: 'merge-kit',
            events: [{ introduced: '0' }, { fixed: '1.0.5' }],
          }),
        ],
      }),
    ]
    const { findings } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'merge-kit', version: '1.0.2' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-MERG-0001',
      aliases: ['CVE-2024-0300'],
      cvssScore: 5,
      fixedVersions: ['1.0.5', '1.0.9'],
    })
  })

  test('aliased advisories merge in the mirror direction: alias-kit 1.0.2 gives one finding holding both ids', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'alias-kit', version: '1.0.2' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-ALIA-0001',
      aliases: ['CVE-2024-0001'],
      cvssScore: 5,
      fixedVersions: ['1.0.5', '1.0.9'],
    })
  })

  test('two advisories with no shared id: range-kit 1.0.0 gives two findings in advisory id order', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'range-kit', version: '1.0.0' }),
    ])
    expect(
      findings.map(({ advisoryId, fixedVersions }) => [
        advisoryId,
        fixedVersions,
      ]),
    ).toEqual([
      ['GHSA-RANG-0001', ['1.0.5']],
      ['GHSA-RANG-0002', ['1.0.1']],
    ])
  })

  test('transitive alias chain: three advisories linked one to the next merge into one finding in any store order', async () => {
    const chainAdvisories = [
      createAdvisory({
        id: 'GHSA-CHAI-0001',
        affected: [
          createAffectedPackage({
            name: 'chain-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'CVE-2024-0200',
        aliases: ['GHSA-CHAI-0001'],
        affected: [
          createAffectedPackage({
            name: 'chain-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'OSV-2024-0200',
        aliases: ['CVE-2024-0200'],
        affected: [
          createAffectedPackage({
            name: 'chain-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
    ]
    const dependencyVersions = [
      createDependencyVersion({ name: 'chain-kit', version: '1.0.0' }),
    ]
    const forwardResult = await matchInlineDependencies(
      chainAdvisories,
      dependencyVersions,
    )
    const reversedResult = await matchInlineDependencies(
      [...chainAdvisories].reverse(),
      dependencyVersions,
    )
    expect(forwardResult.findings).toHaveLength(1)
    expect(forwardResult.findings[0]).toMatchObject({
      advisoryId: 'GHSA-CHAI-0001',
      aliases: ['CVE-2024-0200', 'OSV-2024-0200'],
    })
    expect(reversedResult).toEqual(forwardResult)
  })

  test('two versions of one package: any-kit 1.0.0 and 2.0.0 give two findings', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'any-kit', version: '2.0.0' }),
      createDependencyVersion({ name: 'any-kit', version: '1.0.0' }),
    ])
    expect(
      findings.map(({ packageName, version }) => `${packageName}@${version}`),
    ).toEqual(['any-kit@1.0.0', 'any-kit@2.0.0'])
  })

  test('deterministic order: two runs give equal findings sorted by package name then version', async () => {
    const dependencyVersions = [
      createDependencyVersion({ name: 'range-kit', version: '1.0.2' }),
      createDependencyVersion({ name: 'any-kit', version: '2.0.0' }),
      createDependencyVersion({ name: 'any-kit', version: '1.0.0' }),
      createDependencyVersion({ name: 'alias-kit', version: '1.0.2' }),
    ]
    const firstResult = await matchFixtureDependencies(dependencyVersions)
    const secondResult = await matchFixtureDependencies(dependencyVersions)
    expect(secondResult).toEqual(firstResult)
    expect(
      firstResult.findings.map(
        ({ packageName, version }) => `${packageName}@${version}`,
      ),
    ).toEqual([
      'alias-kit@1.0.2',
      'any-kit@1.0.0',
      'any-kit@2.0.0',
      'range-kit@1.0.2',
    ])

    // every hand-written finding waits for the oracle
    for (const finding of firstResult.findings) {
      expect(finding.matcherAgreement).toBe('oracle-unavailable')
    }
  })

  test('alias and real package at one version: lodash before lodash-legacy whatever the input order', async () => {
    const realPackageVersion = createDependencyVersion({
      name: 'lodash',
      version: '4.17.20',
    })
    const aliasVersion = createDependencyVersion({
      name: 'lodash-legacy',
      version: '4.17.20',
      realPackageName: 'lodash',
    })
    const forwardResult = await matchFixtureDependencies([
      realPackageVersion,
      aliasVersion,
    ])
    const reversedResult = await matchFixtureDependencies([
      aliasVersion,
      realPackageVersion,
    ])
    expect(
      forwardResult.findings.map(
        ({ installedPackageName }) => installedPackageName,
      ),
    ).toEqual(['lodash', 'lodash-legacy'])
    expect(reversedResult).toEqual(forwardResult)
  })
})

describe('matchDependencies introduced by the pull request', () => {
  test('added and changed versions: both findings are introduced by the pull request', async () => {
    const addedVersion = createDependencyVersion({
      name: 'alias-kit',
      version: '1.0.2',
    })
    const dependencyDiff: DependencyDiff = {
      added: [addedVersion],
      removed: [],
      changed: [{ name: 'last-kit', fromVersion: '1.0.0', toVersion: '1.1.0' }],
      unchangedCount: 0,
    }
    const { findings } = await matchFixtureDependencies(
      [
        addedVersion,
        createDependencyVersion({ name: 'last-kit', version: '1.1.0' }),
      ],
      dependencyDiff,
    )
    expect(
      findings.map(({ packageName, isIntroducedByPullRequest }) => [
        packageName,
        isIntroducedByPullRequest,
      ]),
    ).toEqual([
      ['alias-kit', true],
      ['last-kit', true],
    ])
  })

  test('version not in the diff: the finding is not introduced by the pull request', async () => {
    const dependencyDiff: DependencyDiff = {
      added: [createDependencyVersion({ name: 'open-kit', version: '2.5.0' })],
      removed: [],
      changed: [{ name: 'open-kit', fromVersion: '2.0.0', toVersion: '2.9.0' }],
      unchangedCount: 0,
    }
    const { findings } = await matchFixtureDependencies(
      [createDependencyVersion({ name: 'open-kit', version: '3.0.0' })],
      dependencyDiff,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.isIntroducedByPullRequest).toBe(false)
  })

  test('changed entry whose fromVersion is the version: the finding is not introduced by the pull request', async () => {
    const dependencyDiff: DependencyDiff = {
      added: [],
      removed: [],
      changed: [{ name: 'last-kit', fromVersion: '1.1.0', toVersion: '1.3.0' }],
      unchangedCount: 0,
    }
    const { findings } = await matchFixtureDependencies(
      [createDependencyVersion({ name: 'last-kit', version: '1.1.0' })],
      dependencyDiff,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.isIntroducedByPullRequest).toBe(false)
  })

  test('removed entry of the version: the finding is not introduced by the pull request', async () => {
    const lastKitVersion = createDependencyVersion({
      name: 'last-kit',
      version: '1.1.0',
    })
    const dependencyDiff: DependencyDiff = {
      added: [],
      removed: [lastKitVersion],
      changed: [],
      unchangedCount: 0,
    }
    const { findings } = await matchFixtureDependencies(
      [lastKitVersion],
      dependencyDiff,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.isIntroducedByPullRequest).toBe(false)
  })

  test('added entry of another package at the same version: the finding is not introduced by the pull request', async () => {
    const dependencyDiff: DependencyDiff = {
      added: [createDependencyVersion({ name: 'open-kit', version: '1.1.0' })],
      removed: [],
      changed: [],
      unchangedCount: 0,
    }
    const { findings } = await matchFixtureDependencies(
      [createDependencyVersion({ name: 'last-kit', version: '1.1.0' })],
      dependencyDiff,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.isIntroducedByPullRequest).toBe(false)
  })
})

describe('matchDependencies affected entries by ecosystem and name', () => {
  test('other ecosystem ignored: pypi-kit gives nothing', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'pypi-kit', version: '1.0.0' }),
    ])
    expect(findings).toEqual([])
  })

  test('ecosystem NPM in upper case ignored: the entry is not considered and gives nothing', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-CASE-0001',
        affected: [
          createAffectedPackage({
            name: 'case-kit',
            events: coverEveryVersion,
            ecosystem: 'NPM',
          }),
        ],
      }),
    ]
    const { findings } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'case-kit', version: '1.0.0' }),
    ])
    expect(findings).toEqual([])
  })

  test('affected name differing only in case matched: CASE-KIT covers case-kit after normalization', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-CASE-0002',
        affected: [
          createAffectedPackage({
            name: 'CASE-KIT',
            events: coverEveryVersion,
          }),
        ],
      }),
    ]
    const { findings } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'case-kit', version: '1.0.0' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      packageName: 'case-kit',
      advisoryId: 'GHSA-CASE-0002',
    })
  })

  test('alias looked up by its real name: lodash-legacy with real package name lodash', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({
        name: 'lodash-legacy',
        version: '4.17.20',
        realPackageName: 'lodash',
      }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      packageName: 'lodash',
      installedPackageName: 'lodash-legacy',
      version: '4.17.20',
      advisoryId: 'GHSA-LODA-0001',
    })
  })
})

describe('matchDependencies exact versions list', () => {
  test('listed version: listed-kit 1.0.0.1 gives a finding with the unparseable flag set', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'listed-kit', version: '1.0.0.1' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-LIST-0001',
      version: '1.0.0.1',
      isVersionUnparseable: true,
      fixedVersions: [],
    })
  })
})

describe('matchDependencies unparseable versions', () => {
  test('not covered by a range: a workspace version against introduced 0 with no upper event gives no finding', async () => {
    const workspaceVersion = createDependencyVersion({
      name: 'any-kit',
      version: 'workspace:packages/utils',
    })
    expect(workspaceVersion.isVersionUnparseable).toBe(true)
    const { findings } = await matchFixtureDependencies([workspaceVersion])
    expect(findings).toEqual([])
  })
})

describe('matchDependencies fixed versions', () => {
  test('two matching ranges: the alias-kit group lists 1.0.5 and 1.0.9', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'alias-kit', version: '1.0.2' }),
    ])
    expect(findings[0]?.fixedVersions).toEqual(['1.0.5', '1.0.9'])
  })
})

describe('matchDependencies withdrawn advisories', () => {
  test('withdrawn advisory: withdrawn-kit 1.0.0 gives no finding and the audit counts it', async () => {
    const { findings, audit } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'withdrawn-kit', version: '1.0.0' }),
    ])
    expect(findings).toEqual([])
    expect(audit).toEqual({
      withdrawnAdvisoryCount: 1,
      ignoredGitRangeCount: 0,
      notes: [],
    })
  })

  test('withdrawn advisory alias-linked to a live advisory: the finding keeps only the live ids, score and fixed versions', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-LIVE-0001',
        severityScore: 5,
        affected: [
          createAffectedPackage({
            name: 'live-kit',
            events: [{ introduced: '0' }, { fixed: '1.5.0' }],
          }),
        ],
      }),
      createAdvisory({
        id: 'GHSA-WITH-0002',
        aliases: ['GHSA-LIVE-0001'],
        severityScore: 9.8,
        withdrawn: withdrawnAt,
        affected: [
          createAffectedPackage({
            name: 'live-kit',
            events: [{ introduced: '0' }, { fixed: '2.0.0' }],
          }),
        ],
      }),
    ]
    const { findings, audit } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'live-kit', version: '1.0.0' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-LIVE-0001',
      aliases: [],
      severity: 'medium',
      cvssScore: 5,
      fixedVersions: ['1.5.0'],
    })
    expect(audit.withdrawnAdvisoryCount).toBe(1)
  })

  test('withdrawn advisory aliasing two live advisories: the live advisories stay two findings', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-BRID-0001',
        affected: [
          createAffectedPackage({
            name: 'bridge-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'GHSA-BRID-0002',
        affected: [
          createAffectedPackage({
            name: 'bridge-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'GHSA-WITH-0003',
        aliases: ['GHSA-BRID-0001', 'GHSA-BRID-0002'],
        withdrawn: withdrawnAt,
        affected: [
          createAffectedPackage({
            name: 'bridge-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
    ]
    const { findings, audit } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'bridge-kit', version: '1.0.0' }),
    ])
    expect(
      findings.map(({ advisoryId, aliases }) => [advisoryId, aliases]),
    ).toEqual([
      ['GHSA-BRID-0001', []],
      ['GHSA-BRID-0002', []],
    ])
    expect(audit.withdrawnAdvisoryCount).toBe(1)
  })

  test('withdrawn advisory that does not cover the version: only the covered version is counted', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-WITH-0004',
        withdrawn: withdrawnAt,
        affected: [
          createAffectedPackage({
            name: 'gone-kit',
            events: [{ introduced: '0' }, { fixed: '1.0.0' }],
          }),
        ],
      }),
    ]
    const { findings, audit } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'gone-kit', version: '5.0.0' }),
      createDependencyVersion({ name: 'gone-kit', version: '0.5.0' }),
    ])
    expect(findings).toEqual([])
    expect(audit.withdrawnAdvisoryCount).toBe(1)
  })

  test('live advisory whose aliases name a withdrawn GHSA id: the finding is named after that GHSA id with the CVE as alias', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-WITH-0005',
        aliases: ['CVE-2024-0005'],
        withdrawn: withdrawnAt,
        affected: [
          createAffectedPackage({
            name: 'named-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'CVE-2024-0005',
        aliases: ['GHSA-WITH-0005'],
        affected: [
          createAffectedPackage({
            name: 'named-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
    ]
    const { findings, audit } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'named-kit', version: '1.0.0' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-WITH-0005',
      aliases: ['CVE-2024-0005'],
    })
    expect(audit.withdrawnAdvisoryCount).toBe(1)
  })
})

describe('matchDependencies duplicated store entries', () => {
  test('store returns one advisory twice: the audit counts the withdrawn advisory and the GIT range once and gives one finding', async () => {
    const liveAdvisory = createAdvisory({
      id: 'GHSA-DUPE-0001',
      affected: [
        {
          ecosystem: 'npm',
          name: 'dupe-kit',
          versions: [],
          ranges: [
            { type: 'GIT', events: [{ introduced: '0000000' }] },
            { type: 'SEMVER', events: coverEveryVersion },
          ],
        },
      ],
    })
    const withdrawnAdvisory = createAdvisory({
      id: 'GHSA-DUPW-0001',
      withdrawn: withdrawnAt,
      affected: [
        createAffectedPackage({ name: 'dupe-kit', events: coverEveryVersion }),
      ],
    })
    const { findings, audit } = await matchInlineDependencies(
      [liveAdvisory, liveAdvisory, withdrawnAdvisory, withdrawnAdvisory],
      [createDependencyVersion({ name: 'dupe-kit', version: '1.0.0' })],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-DUPE-0001',
      aliases: [],
    })
    expect(audit).toEqual({
      withdrawnAdvisoryCount: 1,
      ignoredGitRangeCount: 1,
      notes: ['ignored a GIT range of GHSA-DUPE-0001 for dupe-kit'],
    })
  })
})

describe('matchDependencies GIT ranges', () => {
  test('GIT range beside a SEMVER range: git-kit 1.0.0 gives one finding and the audit notes the ignored range', async () => {
    const { findings, audit } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'git-kit', version: '1.0.0' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-GITR-0001',
      fixedVersions: ['1.1.0'],
    })
    expect(audit).toEqual({
      withdrawnAdvisoryCount: 0,
      ignoredGitRangeCount: 1,
      notes: ['ignored a GIT range of GHSA-GITR-0001 for git-kit'],
    })
  })

  test('GIT range noted once per dependency version: git-kit 1.0.0 and 2.0.0 give two notes', async () => {
    const { audit } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'git-kit', version: '1.0.0' }),
      createDependencyVersion({ name: 'git-kit', version: '2.0.0' }),
    ])
    expect(audit.ignoredGitRangeCount).toBe(2)
    expect(audit.notes).toEqual([
      'ignored a GIT range of GHSA-GITR-0001 for git-kit',
      'ignored a GIT range of GHSA-GITR-0001 for git-kit',
    ])
  })
})

describe('matchDependencies severity and confidence', () => {
  test('score thresholds: 9.8, 7, 4 and 3.9 give critical, high, medium and low', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'range-kit', version: '1.0.2' }),
      createDependencyVersion({ name: 'last-kit', version: '1.1.0' }),
      createDependencyVersion({ name: 'open-kit', version: '3.0.0' }),
      createDependencyVersion({ name: 'listed-kit', version: '0.5.0' }),
    ])
    expect(
      findings.map(({ packageName, severity, cvssScore, confidence }) => [
        packageName,
        severity,
        cvssScore,
        confidence,
      ]),
    ).toEqual([
      ['last-kit', 'high', 7, 0.9],
      ['listed-kit', 'low', 3.9, 0.9],
      ['open-kit', 'medium', 4, 0.9],
      ['range-kit', 'critical', 9.8, 0.9],
    ])
  })

  test('exact score boundaries: 9 is critical, 6.99 is medium and 3.99 is low', async () => {
    const advisories = [
      createAdvisory({
        id: 'GHSA-SCOR-0009',
        severityScore: 9,
        affected: [
          createAffectedPackage({
            name: 'critical-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'GHSA-SCOR-0699',
        severityScore: 6.99,
        affected: [
          createAffectedPackage({
            name: 'medium-kit',
            events: coverEveryVersion,
          }),
        ],
      }),
      createAdvisory({
        id: 'GHSA-SCOR-0399',
        severityScore: 3.99,
        affected: [
          createAffectedPackage({ name: 'low-kit', events: coverEveryVersion }),
        ],
      }),
    ]
    const { findings } = await matchInlineDependencies(advisories, [
      createDependencyVersion({ name: 'critical-kit', version: '1.0.0' }),
      createDependencyVersion({ name: 'medium-kit', version: '1.0.0' }),
      createDependencyVersion({ name: 'low-kit', version: '1.0.0' }),
    ])
    expect(
      findings.map(({ packageName, severity, cvssScore }) => [
        packageName,
        severity,
        cvssScore,
      ]),
    ).toEqual([
      ['critical-kit', 'critical', 9],
      ['low-kit', 'low', 3.99],
      ['medium-kit', 'medium', 6.99],
    ])
  })

  test('scored and unscored advisories in one group: alias-kit 1.0.2 has confidence 0.9 and the highest score', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'alias-kit', version: '1.0.2' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: 'medium',
      confidence: 0.9,
      cvssScore: 5,
    })
  })

  test('no score: eco-kit 0.9.0 is medium with confidence 0.5 and no cvssScore property', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({ name: 'eco-kit', version: '0.9.0' }),
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      advisoryId: 'GHSA-ECOS-0001',
      severity: 'medium',
      confidence: 0.5,
    })
    expect(findings[0]).not.toHaveProperty('cvssScore')
    expect(Object.hasOwn(findings[0] ?? {}, 'cvssScore')).toBe(false)
  })
})

describe('matchDependencies finding fields', () => {
  test('development dependency of a reviewed advisory: lodash 4.17.20 with scope development', async () => {
    const { findings } = await matchFixtureDependencies([
      createDependencyVersion({
        name: 'lodash-legacy',
        version: '4.17.20',
        realPackageName: 'lodash',
        scope: 'development',
      }),
    ])
    expect(findings).toEqual([
      {
        packageName: 'lodash',
        installedPackageName: 'lodash-legacy',
        version: '4.17.20',
        advisoryId: 'GHSA-LODA-0001',
        aliases: [],
        severity: 'high',
        confidence: 0.9,
        cvssScore: 7.5,
        isGithubReviewed: true,
        dependencyScope: 'development',
        isVersionUnparseable: false,
        isIntroducedByPullRequest: false,
        fixedVersions: ['4.17.21'],
        matcherAgreement: 'oracle-unavailable',
      },
    ])
  })
})

// match the given versions against the fixture store, with an empty diff unless one is given
function matchFixtureDependencies(
  dependencyVersions: DependencyVersion[],
  dependencyDiff: DependencyDiff = createEmptyDependencyDiff(),
): Promise<MatchDependenciesResult> {
  return matchDependencies({
    dependencySet: createDependencySet(dependencyVersions),
    dependencyDiff,
    advisoryStore,
  })
}

// match the given versions against a store built from inline advisories, with an empty diff
function matchInlineDependencies(
  advisories: Advisory[],
  dependencyVersions: DependencyVersion[],
): Promise<MatchDependenciesResult> {
  return matchDependencies({
    dependencySet: createDependencySet(dependencyVersions),
    dependencyDiff: createEmptyDependencyDiff(),
    advisoryStore: createFixtureAdvisoryStore(advisories),
  })
}

// build a GitHub reviewed inline advisory, with a score and a withdrawn timestamp only when given
function createAdvisory({
  id,
  affected,
  aliases = [],
  severityScore,
  withdrawn,
}: CreateAdvisoryOptions): Advisory {
  const advisory: Advisory = {
    id,
    aliases,
    summary: `${id} summary`,
    details: `${id} details`,
    affected,
    references: [],
    published: '2024-01-01T00:00:00Z',
    modified: '2024-01-01T00:00:00Z',
    isGithubReviewed: true,
  }
  if (severityScore !== undefined) {
    advisory.severityScore = severityScore
  }
  if (withdrawn !== undefined) {
    advisory.withdrawn = withdrawn
  }
  return advisory
}

// build an affected entry with no listed versions and one SEMVER range of the given events
function createAffectedPackage({
  name,
  events,
  ecosystem = 'npm',
}: CreateAffectedPackageOptions): AffectedPackage {
  return { ecosystem, name, versions: [], ranges: [{ type: 'SEMVER', events }] }
}
