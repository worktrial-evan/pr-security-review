// tests the reachability step. nothing is scanned without matches and a match becomes a classified sca finding
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { DependencyFinding } from '@/matcher/dependency-finding'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { scaFindingSchema } from '@/shared/finding'
import { parseLockfiles } from './lockfile-step'
import {
  createMemoryAuditSink,
  removeSnapshotPullRequest,
  type SnapshotPullRequest,
  writeSnapshotPullRequest,
} from './pipeline-fixtures'
import { classifyDependencyFindings, toScaFinding } from './reachability-step'

// a matcher finding for the package the snapshot adds
const deltaKitFinding: DependencyFinding = {
  packageName: 'delta-kit',
  installedPackageName: 'delta-kit',
  version: '1.0.0',
  advisoryId: 'GHSA-aaaa-bbbb-cccc',
  aliases: ['CVE-2026-0001'],
  severity: 'high',
  confidence: 0.9,
  isGithubReviewed: true,
  dependencyScope: 'prod',
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
    baseDir: snapshotPullRequest.baseDir,
    headDir: snapshotPullRequest.headDir,
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
      return snapshotPullRequest.headDir
    }
    const scaFindings = await classifyDependencyFindings({
      lockfileMatches: [],
      pullRequestSource,
      auditSink: createMemoryAuditSink(),
      runId: 'test-run',
    })

    expect(scaFindings).toEqual([])
    expect(checkoutCount).toBe(0)
  })

  test('classifies a match the head code imports as direct-imported', async () => {
    // import the added package from a head source file
    await Bun.write(
      join(snapshotPullRequest.headDir, 'src', 'use-delta.ts'),
      "import { delta } from 'delta-kit'\nexport const value = delta\n",
    )
    const changedFiles = await pullRequestSource.listChangedFiles()
    const { lockfileChanges } = await parseLockfiles({
      pullRequestSource,
      changedFiles,
    })
    const auditSink = createMemoryAuditSink()

    // classify one match against the bumped lockfile
    const [scaFinding] = await classifyDependencyFindings({
      lockfileMatches: lockfileChanges.map((lockfileChange) => ({
        lockfileChange,
        dependencyFindings: [deltaKitFinding],
      })),
      pullRequestSource,
      auditSink,
      runId: 'test-run',
    })

    // the finding is direct-imported from the new file and the scan wrote its note
    expect(scaFinding?.reachability).toBe('direct-imported')
    expect(scaFinding?.importedBy).toEqual(['src/use-delta.ts'])
    expect(scaFinding?.file).toBe('bun.lock')
    expect(auditSink.events.map((event) => event.step)).toEqual([
      'reachability',
    ])
  })
})

describe('toScaFinding', () => {
  test('builds a valid sca finding with a stable id', () => {
    const reachabilityClassification = {
      reachability: 'transitive' as const,
      importedBy: [],
      dependencyPath: ['alpha-kit@1.0.0', 'delta-kit@1.0.0'],
    }
    const scaFinding = toScaFinding({
      dependencyFinding: deltaKitFinding,
      lockfilePath: 'bun.lock',
      reachabilityClassification,
    })
    const sameScaFinding = toScaFinding({
      dependencyFinding: deltaKitFinding,
      lockfilePath: 'bun.lock',
      reachabilityClassification,
    })

    expect(scaFindingSchema.parse(scaFinding)).toEqual(scaFinding)
    expect(scaFinding.title).toBe(
      'delta-kit@1.0.0 is affected by GHSA-aaaa-bbbb-cccc',
    )
    expect(scaFinding.id).toBe(sameScaFinding.id)
    expect(scaFinding).not.toHaveProperty('installedPackageName')
  })
})
