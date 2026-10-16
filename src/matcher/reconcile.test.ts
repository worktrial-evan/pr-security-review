// tests for reconcileMatches: one test per agreement value, many-to-one and one-to-many agreement, an oracle match
// without ids, duplicate oracle matches, unsorted oracle ids, the sorted output order on both branches including its
// tie-breaks, and inputs left untouched
import { describe, expect, test } from 'bun:test'
import type {
  DependencyFinding,
  OracleMatch,
  OracleResult,
} from './dependency-finding'
import { reconcileMatches } from './reconcile'

describe('reconcileMatches', () => {
  test('Both: marks a finding both when the oracle reports the same package version with a shared id', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-LODA-0001',
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['CVE-2024-0001', 'GHSA-LODA-0001'],
        },
      ]),
    })
    expect(reconciledFindings).toHaveLength(1)
    expect(reconciledFindings[0]?.matcherAgreement).toBe('both')
    expect(reconciledFindings[0]?.advisoryId).toBe('GHSA-LODA-0001')
  })

  test('Handwritten only: marks a finding handwritten-only when the oracle reports nothing for it', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-LODA-0001',
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'lodash',
          version: '4.17.19',
          advisoryIds: ['GHSA-LODA-0001'],
        },
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['GHSA-LODA-9999'],
        },
      ]),
    })

    // the hand-written finding stands alone and both oracle matches become oracle-only findings
    const handwrittenFinding = reconciledFindings.find(
      (dependencyFinding) =>
        dependencyFinding.advisoryId === 'GHSA-LODA-0001' &&
        dependencyFinding.version === '4.17.20',
    )
    expect(handwrittenFinding?.matcherAgreement).toBe('handwritten-only')
    expect(reconciledFindings).toHaveLength(3)
  })

  test('Oracle only: builds a finding from the oracle ids when the hand-written matcher reports nothing', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [],
      oracleResult: createRanOracleResult([
        {
          packageName: 'minimist',
          version: '1.0.0.1',
          advisoryIds: ['CVE-2024-0002', 'GHSA-MINI-0001', 'GHSA-MINI-0002'],
        },
      ]),
    })
    expect(reconciledFindings).toEqual([
      {
        packageName: 'minimist',
        installedPackageName: 'minimist',
        version: '1.0.0.1',
        advisoryId: 'GHSA-MINI-0001',
        aliases: ['CVE-2024-0002', 'GHSA-MINI-0002'],
        severity: 'medium',
        confidence: 0.5,
        isGithubReviewed: false,
        dependencyScope: 'prod',
        isVersionUnparseable: true,
        isIntroducedByPullRequest: false,
        fixedVersions: [],
        matcherAgreement: 'oracle-only',
      },
    ])
  })

  test('Oracle only: names the finding after the first id when no id is a GHSA id', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [],
      oracleResult: createRanOracleResult([
        {
          packageName: 'minimist',
          version: '1.2.5',
          advisoryIds: ['CVE-2024-0002', 'CVE-2024-0003'],
        },
      ]),
    })
    expect(reconciledFindings[0]?.advisoryId).toBe('CVE-2024-0002')
    expect(reconciledFindings[0]?.aliases).toEqual(['CVE-2024-0003'])
    expect(reconciledFindings[0]?.isVersionUnparseable).toBe(false)
  })

  test('Oracle unavailable: marks every hand-written finding oracle-unavailable in finding order', () => {
    const handwrittenFindings = [
      createDependencyFinding({
        packageName: 'zebra-kit',
        version: '1.0.0',
        advisoryId: 'GHSA-ZEBR-0001',
        matcherAgreement: 'both',
      }),
      createDependencyFinding({
        packageName: 'alpha-kit',
        version: '1.0.0',
        advisoryId: 'GHSA-ALPH-0001',
      }),
    ]
    const reconciledFindings = reconcileMatches({
      handwrittenFindings,
      oracleResult: { status: 'unavailable', reason: 'no osv-scanner on PATH' },
    })
    expect(
      reconciledFindings.map(
        (dependencyFinding) => dependencyFinding.packageName,
      ),
    ).toEqual(['alpha-kit', 'zebra-kit'])
    expect(
      reconciledFindings.every(
        (dependencyFinding) =>
          dependencyFinding.matcherAgreement === 'oracle-unavailable',
      ),
    ).toBe(true)
  })

  test('sorts the output by package name, then version, then advisory id', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'beta-kit',
          version: 'workspace:packages/utils',
          advisoryId: 'GHSA-BETA-0003',
        }),
        createDependencyFinding({
          packageName: 'beta-kit',
          version: '10.0.0',
          advisoryId: 'GHSA-BETA-0002',
        }),
        createDependencyFinding({
          packageName: 'beta-kit',
          version: '9.0.0',
          advisoryId: 'GHSA-BETA-0002',
        }),
        createDependencyFinding({
          packageName: 'beta-kit',
          version: '9.0.0',
          advisoryId: 'GHSA-BETA-0001',
        }),
        createDependencyFinding({
          packageName: 'beta-kit',
          version: 'abc',
          advisoryId: 'GHSA-BETA-0004',
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'alpha-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-ALPH-0001'],
        },
        {
          packageName: 'Zeta-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-ZETA-0001'],
        },
      ]),
    })

    // semver order puts 9.0.0 before 10.0.0, parseable versions come before unparseable ones, and an upper-case name sorts before lower-case
    expect(
      reconciledFindings.map(
        ({ packageName, version, advisoryId }) =>
          `${packageName}@${version}#${advisoryId}`,
      ),
    ).toEqual([
      'Zeta-kit@1.0.0#GHSA-ZETA-0001',
      'alpha-kit@1.0.0#GHSA-ALPH-0001',
      'beta-kit@9.0.0#GHSA-BETA-0001',
      'beta-kit@9.0.0#GHSA-BETA-0002',
      'beta-kit@10.0.0#GHSA-BETA-0002',
      'beta-kit@abc#GHSA-BETA-0004',
      'beta-kit@workspace:packages/utils#GHSA-BETA-0003',
    ])
  })

  test('marks two hand-written findings both when one oracle match holds both their ids', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'pair-kit',
          version: '1.0.0',
          advisoryId: 'GHSA-PAIR-0001',
        }),
        createDependencyFinding({
          packageName: 'pair-kit',
          version: '1.0.0',
          advisoryId: 'GHSA-PAIR-0002',
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'pair-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-PAIR-0001', 'GHSA-PAIR-0002'],
        },
      ]),
    })

    // both findings agree with the one match and the match leaves no oracle-only finding behind
    expect(
      reconciledFindings.map(
        ({ advisoryId, matcherAgreement }) =>
          `${advisoryId}:${matcherAgreement}`,
      ),
    ).toEqual(['GHSA-PAIR-0001:both', 'GHSA-PAIR-0002:both'])
  })

  test('marks one hand-written finding both when two oracle matches each share one of its ids', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'split-kit',
          version: '1.0.0',
          advisoryId: 'GHSA-SPLI-0001',
          aliases: ['GHSA-SPLI-0002'],
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'split-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-SPLI-0001'],
        },
        {
          packageName: 'split-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-SPLI-0002'],
        },
      ]),
    })

    // the finding agrees with both matches and neither match leaves an oracle-only finding behind
    expect(reconciledFindings).toHaveLength(1)
    expect(reconciledFindings[0]?.matcherAgreement).toBe('both')
  })

  test('skips an oracle match with no ids and leaves the hand-written finding handwritten-only', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'empty-kit',
          version: '1.0.0',
          advisoryId: 'GHSA-EMPT-0001',
        }),
      ],
      oracleResult: createRanOracleResult([
        { packageName: 'empty-kit', version: '1.0.0', advisoryIds: [] },
        { packageName: 'other-kit', version: '2.0.0', advisoryIds: [] },
      ]),
    })
    expect(reconciledFindings).toHaveLength(1)
    expect(reconciledFindings[0]?.advisoryId).toBe('GHSA-EMPT-0001')
    expect(reconciledFindings[0]?.matcherAgreement).toBe('handwritten-only')
  })

  test('Duplicate oracle matches: creates one oracle-only finding from two identical oracle matches', () => {
    const duplicateOracleMatch = {
      packageName: 'q',
      version: '1.0.0',
      advisoryIds: ['ZZZ-1', 'GHSA-QQQQ-0001', 'CVE-9'],
    }
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [],
      oracleResult: createRanOracleResult([
        duplicateOracleMatch,
        {
          ...duplicateOracleMatch,
          advisoryIds: ['CVE-9', 'GHSA-QQQQ-0001', 'ZZZ-1'],
        },
      ]),
    })
    expect(reconciledFindings).toHaveLength(1)
    expect(reconciledFindings[0]?.advisoryId).toBe('GHSA-QQQQ-0001')
    expect(reconciledFindings[0]?.matcherAgreement).toBe('oracle-only')
  })

  test('Oracle only: picks the first GHSA id in code unit order and sorts the aliases when the oracle ids are unsorted', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [],
      oracleResult: createRanOracleResult([
        {
          packageName: 'unsorted-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-UNSO-0009', 'CVE-2024-0001', 'GHSA-UNSO-0001'],
        },
      ]),
    })
    expect(reconciledFindings[0]?.advisoryId).toBe('GHSA-UNSO-0001')
    expect(reconciledFindings[0]?.aliases).toEqual([
      'CVE-2024-0001',
      'GHSA-UNSO-0009',
    ])
  })

  test('orders versions that differ only in build metadata the same whatever the input order', () => {
    const buildMetadataVersions = ['1.0.0+b', '1.0.0+a', '1.0.0']
    const handwrittenFindings = buildMetadataVersions.map((version) =>
      createDependencyFinding({
        packageName: 'build-kit',
        version,
        advisoryId: 'GHSA-BUIL-0001',
      }),
    )
    const reversedHandwrittenFindings = [...handwrittenFindings].reverse()

    // both input orders give the same output in code unit order of the version
    const reconciledFindings = reconcileMatches({
      handwrittenFindings,
      oracleResult: createRanOracleResult([]),
    })
    const reversedReconciledFindings = reconcileMatches({
      handwrittenFindings: reversedHandwrittenFindings,
      oracleResult: createRanOracleResult([]),
    })
    expect(reconciledFindings).toEqual(reversedReconciledFindings)
    expect(
      reconciledFindings.map((dependencyFinding) => dependencyFinding.version),
    ).toEqual(['1.0.0', '1.0.0+a', '1.0.0+b'])
  })

  test('orders an alias and its real package at one version by installed package name', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'lodash',
          installedPackageName: 'lodash-legacy',
          version: '4.17.20',
          advisoryId: 'GHSA-LODA-0001',
        }),
        createDependencyFinding({
          packageName: 'lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-LODA-0001',
        }),
      ],
      oracleResult: createRanOracleResult([]),
    })
    expect(
      reconciledFindings.map(
        (dependencyFinding) => dependencyFinding.installedPackageName,
      ),
    ).toEqual(['lodash', 'lodash-legacy'])
  })

  test('marks a finding both when only one of its aliases is among the oracle ids', () => {
    const reconciledFindings = reconcileMatches({
      handwrittenFindings: [
        createDependencyFinding({
          packageName: 'Lodash',
          version: '4.17.20',
          advisoryId: 'GHSA-LODA-0001',
          aliases: ['CVE-2024-0001'],
        }),
      ],
      oracleResult: createRanOracleResult([
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['CVE-2024-0001'],
        },
      ]),
    })
    expect(reconciledFindings).toHaveLength(1)
    expect(reconciledFindings[0]?.matcherAgreement).toBe('both')
  })

  test('leaves the inputs untouched', () => {
    const handwrittenFindings = [
      createDependencyFinding({
        packageName: 'zebra-kit',
        version: '1.0.0',
        advisoryId: 'GHSA-ZEBR-0001',
      }),
      createDependencyFinding({
        packageName: 'alpha-kit',
        version: '1.0.0',
        advisoryId: 'GHSA-ALPH-0001',
      }),
    ]
    const oracleResult = createRanOracleResult([
      {
        packageName: 'alpha-kit',
        version: '1.0.0',
        advisoryIds: ['GHSA-ALPH-0001'],
      },
      {
        packageName: 'omega-kit',
        version: '2.0.0',
        advisoryIds: ['GHSA-OMEG-0001'],
      },
    ])
    const handwrittenFindingsBefore = structuredClone(handwrittenFindings)
    const oracleResultBefore = structuredClone(oracleResult)

    // reconcile, then check the inputs still equal their copies and share no object with the output
    const reconciledFindings = reconcileMatches({
      handwrittenFindings,
      oracleResult,
    })
    expect(handwrittenFindings).toEqual(handwrittenFindingsBefore)
    expect(oracleResult).toEqual(oracleResultBefore)
    for (const reconciledFinding of reconciledFindings) {
      expect(handwrittenFindings).not.toContain(reconciledFinding)
    }

    // the output arrays are copies of the input arrays
    const inputAliasArrays = handwrittenFindings.map(
      (handwrittenFinding) => handwrittenFinding.aliases,
    )
    const inputFixedVersionArrays = handwrittenFindings.map(
      (handwrittenFinding) => handwrittenFinding.fixedVersions,
    )
    for (const reconciledFinding of reconciledFindings) {
      expect(inputAliasArrays).not.toContain(reconciledFinding.aliases)
      expect(inputFixedVersionArrays).not.toContain(
        reconciledFinding.fixedVersions,
      )
    }
  })
})

// the package name, version and advisory id of a test finding, with any other field overridden
interface CreateDependencyFindingOptions extends Partial<DependencyFinding> {
  packageName: string
  version: string
  advisoryId: string
}

// build a high, scored, reviewed prod finding with no aliases and no fixed versions unless overridden
function createDependencyFinding({
  packageName,
  version,
  advisoryId,
  ...overrides
}: CreateDependencyFindingOptions): DependencyFinding {
  return {
    packageName,
    installedPackageName: packageName,
    version,
    advisoryId,
    aliases: [],
    severity: 'high',
    confidence: 0.9,
    cvssScore: 7.5,
    isGithubReviewed: true,
    dependencyScope: 'prod',
    isVersionUnparseable: false,
    isIntroducedByPullRequest: true,
    fixedVersions: [],
    matcherAgreement: 'oracle-unavailable',
    ...overrides,
  }
}

// build a ran oracle result that saw exactly the matched packages
function createRanOracleResult(oracleMatches: OracleMatch[]): OracleResult {
  return {
    status: 'ran',
    packages: oracleMatches.map(({ packageName, version }) => ({
      packageName,
      version,
    })),
    matches: oracleMatches,
  }
}
