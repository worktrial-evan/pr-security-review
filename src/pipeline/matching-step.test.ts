// tests the match-dependencies step. it covers nothing to match and a missing store. it also covers a match with the oracle ran and unavailable
import { describe, expect, test } from 'bun:test'
import {
  createDependencySet,
  createDependencyVersion,
  createFixtureAdvisoryStore,
  readFixtureAdvisories,
} from '@/matcher/matcher-fixtures'
import type { RunOracleOptions } from '@/matcher/oracle'
import type { PullRequestSource } from '@/shared/pull-request-source'
import type { LockfileChange } from './lockfile-step'
import { createLockfileMatcher, type RunOracle } from './matching-step'
import { createMemoryAuditSink, makeTestClock } from './pipeline-fixtures'
import { createRunRecord, type RunRecord } from './run-record'

// a head lockfile that adds range-kit 1.0.0. GHSA-RANG-0001 and GHSA-RANG-0002 both cover it
const rangeKitVersion = createDependencyVersion({
  name: 'range-kit',
  version: '1.0.0',
})
const lockfileChange: LockfileChange = {
  lockfilePath: 'web/bun.lock',
  lockfileKind: 'bun',
  baseDependencySet: createDependencySet([]),
  headDependencySet: createDependencySet([rangeKitVersion]),
  dependencyDiff: {
    added: [rangeKitVersion],
    removed: [],
    changed: [],
    unchangedCount: 0,
  },
}

// a source whose head checkout is a fixed directory and that counts its checkouts
function createHeadOnlySource(): PullRequestSource & { checkoutCount: number } {
  const headOnlySource = {
    checkoutCount: 0,
    async checkoutHead(): Promise<string> {
      headOnlySource.checkoutCount += 1
      return '/checkout/head'
    },
  }
  return headOnlySource as unknown as PullRequestSource & {
    checkoutCount: number
  }
}

// a fresh run record over an in-memory sink
function createTestRunRecord(): RunRecord {
  return createRunRecord({
    runId: 'test-run',
    auditSink: createMemoryAuditSink(),
    now: makeTestClock(),
  })
}

// a run of the matcher with an oracle that ran and saw nothing
async function matchWithEmptyOracle(matchedLockfileChange: LockfileChange) {
  return createLockfileMatcher({
    runOracle: async () => ({ status: 'ran', packages: [], matches: [] }),
  })({
    lockfileChanges: [matchedLockfileChange],
    advisoryStore: createFixtureAdvisoryStore(await readFixtureAdvisories()),
    pullRequestSource: createHeadOnlySource(),
    runRecord: createTestRunRecord(),
  })
}

describe('createLockfileMatcher', () => {
  test('matches nothing and checks nothing out without a changed lockfile', async () => {
    const pullRequestSource = createHeadOnlySource()
    const matchDependencies = createLockfileMatcher({
      runOracle: async () => ({ status: 'ran', packages: [], matches: [] }),
    })
    const dependencyMatching = await matchDependencies({
      lockfileChanges: [],
      advisoryStore: undefined,
      pullRequestSource,
      runRecord: createTestRunRecord(),
    })

    expect(dependencyMatching).toEqual({
      lockfileMatches: [],
      degradedReasons: [],
    })
    expect(pullRequestSource.checkoutCount).toBe(0)
  })

  test('degrades the step when a lockfile changed but no store was loaded', async () => {
    const matchDependencies = createLockfileMatcher()
    const dependencyMatching = await matchDependencies({
      lockfileChanges: [lockfileChange],
      advisoryStore: undefined,
      pullRequestSource: createHeadOnlySource(),
      runRecord: createTestRunRecord(),
    })

    expect(dependencyMatching.degradedReasons).toEqual([
      'no advisory store was loaded',
    ])
  })

  test('scans the head lockfile with the oracle and marks the agreement', async () => {
    // an oracle that records its call and reports only the first match
    const oracleCalls: RunOracleOptions[] = []
    const runOracle: RunOracle = async (options) => {
      oracleCalls.push(options)
      return {
        status: 'ran',
        packages: [{ packageName: 'range-kit', version: '1.0.0' }],
        matches: [
          {
            packageName: 'range-kit',
            version: '1.0.0',
            advisoryIds: ['GHSA-RANG-0001'],
          },
        ],
      }
    }
    const runRecord = createTestRunRecord()
    const dependencyMatching = await createLockfileMatcher({ runOracle })({
      lockfileChanges: [lockfileChange],
      advisoryStore: createFixtureAdvisoryStore(await readFixtureAdvisories()),
      pullRequestSource: createHeadOnlySource(),
      runRecord,
    })

    // the oracle read the head copy of the lockfile and both matchers agree on the finding
    expect(oracleCalls.map((call) => call.lockfilePath)).toEqual([
      '/checkout/head/web/bun.lock',
    ])
    const dependencyFindings =
      dependencyMatching.lockfileMatches[0]?.dependencyFindings ?? []
    expect(
      dependencyFindings.map((finding) => [
        finding.advisoryId,
        finding.matcherAgreement,
      ]),
    ).toEqual([
      ['GHSA-RANG-0001', 'both'],
      ['GHSA-RANG-0002', 'handwritten-only'],
    ])
    expect(dependencyFindings[0]?.isIntroducedByPullRequest).toBe(true)
    expect(dependencyMatching.degradedReasons).toEqual([])
  })

  test('degrades the step and keeps the hand-written findings when the oracle is unavailable', async () => {
    const runRecord = createTestRunRecord()
    const dependencyMatching = await createLockfileMatcher({
      runOracle: async () => ({
        status: 'unavailable',
        reason: 'osv-scanner is not on PATH',
      }),
    })({
      lockfileChanges: [lockfileChange],
      advisoryStore: createFixtureAdvisoryStore(await readFixtureAdvisories()),
      pullRequestSource: createHeadOnlySource(),
      runRecord,
    })

    expect(
      dependencyMatching.lockfileMatches[0]?.dependencyFindings.map(
        (finding) => finding.matcherAgreement,
      ),
    ).toEqual(['oracle-unavailable', 'oracle-unavailable'])
    expect(dependencyMatching.degradedReasons).toEqual([
      'osv-scanner cross-check skipped for web/bun.lock: osv-scanner is not on PATH',
    ])
  })

  test('sets aside an advisory that already affected the package at base', async () => {
    // base has range-kit 1.0.1 and head moves it to 1.0.0. GHSA-RANG-0001 covers both
    const baseVersion = createDependencyVersion({
      name: 'range-kit',
      version: '1.0.1',
    })
    const dependencyMatching = await matchWithEmptyOracle({
      ...lockfileChange,
      baseDependencySet: createDependencySet([baseVersion]),
      dependencyDiff: {
        added: [],
        removed: [],
        changed: [
          { name: 'range-kit', fromVersion: '1.0.1', toVersion: '1.0.0' },
        ],
        unchangedCount: 0,
      },
    })

    // the advisory that covers both versions is pre-existing
    const findingsByAdvisoryId = new Map(
      (dependencyMatching.lockfileMatches[0]?.dependencyFindings ?? []).map(
        (finding) => [finding.advisoryId, finding.isIntroducedByPullRequest],
      ),
    )
    expect(findingsByAdvisoryId.get('GHSA-RANG-0001')).toBe(false)
  })

  test('keeps a finding introduced when the base version is not affected', async () => {
    const dependencyMatching = await matchWithEmptyOracle(lockfileChange)

    const dependencyFindings =
      dependencyMatching.lockfileMatches[0]?.dependencyFindings ?? []
    expect(
      dependencyFindings.every((finding) => finding.isIntroducedByPullRequest),
    ).toBe(true)
  })
})
