// tests the reachability step. nothing is scanned without matches and a match becomes a classified dependency finding
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { DependencyFinding as MatchedDependency } from '@/matcher/dependency-finding'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { dependencyFindingSchema } from '@/shared/finding'
import { parseLockfiles } from './lockfile-step'
import {
  createMemoryAuditSink,
  removeSnapshotPullRequest,
  type SnapshotPullRequest,
  writeSnapshotPullRequest,
} from './pipeline-fixtures'
import {
  classifyDependencyFindings,
  toDependencyFinding,
} from './reachability-step'

// a matcher finding for the package the snapshot adds
const deltaKitFinding: MatchedDependency = {
  packageName: 'delta-kit',
  installedPackageName: 'delta-kit',
  version: '1.0.0',
  advisoryId: 'GHSA-aaaa-bbbb-cccc',
  aliases: ['CVE-2026-0001'],
  severity: 'high',
  confidence: 0.9,
  isGithubReviewed: true,
  dependencyScope: 'production',
  isVersionUnparseable: false,
  isIntroducedByPullRequest: true,
  fixedVersions: ['1.0.1'],
  matcherAgreement: 'both',
}

// the snapshot pull request and its source
let snapshotPullRequest: SnapshotPullRequest
let pullRequestSource: SnapshotPullRequestSource

beforeEach(async () => {
  snapshotPullRequest = await writeSnapshotPullRequest()
  pullRequestSource = new SnapshotPullRequestSource({
    baseDirectory: snapshotPullRequest.baseDirectory,
    headDirectory: snapshotPullRequest.headDirectory,
  })
})

afterEach(async () => {
  await removeSnapshotPullRequest(snapshotPullRequest)
})

describe('classifyDependencyFindings', () => {
  test('checks nothing out when there are no matches', async () => {
    let checkoutCount = 0
    pullRequestSource.checkoutHead = async () => {
      checkoutCount += 1
      return snapshotPullRequest.headDirectory
    }
    const dependencyFindings = await classifyDependencyFindings({
      lockfileMatches: [],
      pullRequestSource,
      auditSink: createMemoryAuditSink(),
      runId: 'test-run',
    })

    expect(dependencyFindings).toEqual([])
    expect(checkoutCount).toBe(0)
  })

  test('classifies a match the head code imports as direct-imported', async () => {
    // import the added package from a head source file
    await Bun.write(
      join(snapshotPullRequest.headDirectory, 'src', 'use-delta.ts'),
      "import { delta } from 'delta-kit'\nexport const value = delta\n",
    )
    const changedFiles = await pullRequestSource.listChangedFiles()
    const { lockfileChanges } = await parseLockfiles({
      pullRequestSource,
      changedFiles,
    })
    const auditSink = createMemoryAuditSink()

    // classify one match against the bumped lockfile
    const [dependencyFinding] = await classifyDependencyFindings({
      lockfileMatches: lockfileChanges.map((lockfileChange) => ({
        lockfileChange,
        dependencyFindings: [deltaKitFinding],
      })),
      pullRequestSource,
      auditSink,
      runId: 'test-run',
    })

    // the finding is direct-imported from the new file and the scan wrote its note
    expect(dependencyFinding?.reachability).toBe('direct-imported')
    expect(dependencyFinding?.importedBy).toEqual(['src/use-delta.ts'])
    expect(dependencyFinding?.file).toBe('bun.lock')
    expect(auditSink.events.map((event) => event.step)).toEqual([
      'reachability',
    ])
  })
})

describe('toDependencyFinding', () => {
  test('builds a valid dependency finding with a stable id', () => {
    const reachabilityClassification = {
      reachability: 'transitive' as const,
      importedBy: [],
      dependencyPath: ['alpha-kit@1.0.0', 'delta-kit@1.0.0'],
    }
    const dependencyFinding = toDependencyFinding({
      dependencyFinding: deltaKitFinding,
      lockfilePath: 'bun.lock',
      reachabilityClassification,
    })
    const sameDependencyFinding = toDependencyFinding({
      dependencyFinding: deltaKitFinding,
      lockfilePath: 'bun.lock',
      reachabilityClassification,
    })

    expect(dependencyFindingSchema.parse(dependencyFinding)).toEqual(
      dependencyFinding,
    )
    expect(dependencyFinding.title).toBe(
      'delta-kit@1.0.0 is affected by GHSA-aaaa-bbbb-cccc',
    )
    expect(dependencyFinding.id).toBe(sameDependencyFinding.id)
    expect(dependencyFinding).not.toHaveProperty('installedPackageName')
  })
})
