// tests the parse-lockfiles step over bumped and added and deleted and unsupported lockfiles
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { parseLockfiles } from './lockfile-step'
import {
  removeSnapshotPullRequest,
  type SnapshotPullRequest,
  writeSnapshotPullRequest,
} from './pipeline-fixtures'

// the snapshot pull request of the current test
let snapshotPullRequest: SnapshotPullRequest

beforeEach(async () => {
  snapshotPullRequest = await writeSnapshotPullRequest()
})

afterEach(async () => {
  await removeSnapshotPullRequest(snapshotPullRequest)
})

// parse the lockfiles of the current snapshot
async function parseSnapshotLockfiles() {
  const pullRequestSource = new SnapshotPullRequestSource({
    baseDirectory: snapshotPullRequest.baseDirectory,
    headDirectory: snapshotPullRequest.headDirectory,
  })
  const changedFiles = await pullRequestSource.listChangedFiles()
  return parseLockfiles({ pullRequestSource, changedFiles })
}

describe('parseLockfiles', () => {
  test('diffs a bumped lockfile at base and head', async () => {
    const { lockfileChanges, unsupportedLockfilePaths } =
      await parseSnapshotLockfiles()

    expect(unsupportedLockfilePaths).toEqual([])
    expect(lockfileChanges).toHaveLength(1)
    const [lockfileChange] = lockfileChanges
    expect(lockfileChange?.lockfilePath).toBe('bun.lock')
    expect(lockfileChange?.lockfileKind).toBe('bun')
    expect(
      lockfileChange?.dependencyDiff.added.map(({ name }) => name),
    ).toEqual(['delta-kit'])
    expect(lockfileChange?.dependencyDiff.changed).toEqual([
      { name: 'bravo-kit', fromVersion: '2.0.0', toVersion: '2.1.0' },
    ])
    expect(
      lockfileChange?.headDependencySet.directDependencyNames.has('delta-kit'),
    ).toBe(true)
  })

  test('diffs an added lockfile against an empty base', async () => {
    await rm(join(snapshotPullRequest.baseDirectory, 'bun.lock'))
    const { lockfileChanges } = await parseSnapshotLockfiles()

    const addedNames = lockfileChanges[0]?.dependencyDiff.added.map(
      ({ name }) => name,
    )
    expect(addedNames).toContain('alpha-kit')
    expect(addedNames).toContain('delta-kit')
    expect(lockfileChanges[0]?.dependencyDiff.removed).toEqual([])
  })

  test('skips a deleted lockfile and lists an unsupported one', async () => {
    await rm(join(snapshotPullRequest.headDirectory, 'bun.lock'))
    await Bun.write(
      join(snapshotPullRequest.headDirectory, 'web', 'yarn.lock'),
      '# yarn\n',
    )
    const { lockfileChanges, unsupportedLockfilePaths } =
      await parseSnapshotLockfiles()

    expect(lockfileChanges).toEqual([])
    expect(unsupportedLockfilePaths).toEqual(['web/yarn.lock'])
  })
})
