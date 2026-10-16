// tests loading the advisory store from a refreshed cache, looking packages up by name and snapshot staleness
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import type { AdvisorySnapshot, AdvisoryStore } from '@/shared/advisory'
import { isSnapshotOlderThan, loadAdvisoryStore } from './advisory-store'
import { osvFixtureNames, readOsvFixture } from './osv-fixtures'
import { refreshAdvisories } from './refresh-advisories'

// every real fixture. the hand-edited github-reviewed-false copy shares its id with github-reviewed-true
const realOsvFixtureNames = osvFixtureNames.filter(
  (osvFixtureName) => osvFixtureName !== 'github-reviewed-false',
)

// a cache refreshed from the real fixtures through a local server
let cacheDirectory = ''
let advisoryStore: AdvisoryStore
beforeAll(async () => {
  // zip every real fixture under a unique name
  const textEncoder = new TextEncoder()
  const osvEntries = await Promise.all(realOsvFixtureNames.map(readOsvFixture))
  const archiveFiles = Object.fromEntries(
    osvEntries.map((osvEntry, i) => [
      `${i}.json`,
      textEncoder.encode(JSON.stringify(osvEntry)),
    ]),
  )
  const archive = zipSync(archiveFiles)

  // refresh from a server returning the archive, then load the store
  const archiveServer = Bun.serve({
    port: 0,
    fetch: () => new Response(archive),
  })
  cacheDirectory = await mkdtemp(join(tmpdir(), 'advisory-store-'))
  await refreshAdvisories({
    ecosystem: 'npm',
    cacheDirectory,
    sourceUrl: archiveServer.url.href,
  })
  archiveServer.stop(true)
  advisoryStore = await loadAdvisoryStore(cacheDirectory)
})
afterAll(async () => {
  await rm(cacheDirectory, { recursive: true, force: true })
})

describe('loadAdvisoryStore', () => {
  test('finds a package whatever its case or surrounding spaces', async () => {
    const lowercaseAdvisories = await advisoryStore.getByPackage('haraka')
    const exactAdvisories = await advisoryStore.getByPackage(' Haraka ')
    expect(lowercaseAdvisories.map((advisory) => advisory.id)).toEqual([
      'GHSA-w5m8-5v9m-xhx5',
    ])
    expect(exactAdvisories).toEqual(lowercaseAdvisories)
  })

  test('returns every advisory affecting a package', async () => {
    const lodashAdvisories = await advisoryStore.getByPackage('lodash')
    expect(lodashAdvisories.map((advisory) => advisory.id)).toEqual([
      'GHSA-fvqr-27wr-82fm',
      'GHSA-xxjr-mmjv-4gpg',
    ])
  })

  test('returns an empty list for an unknown package', async () => {
    expect(await advisoryStore.getByPackage('no-such-package')).toEqual([])
    expect(await advisoryStore.getByPackage('constructor')).toEqual([])
  })

  test('returns copies the caller cannot change the store through', async () => {
    const firstLookup = await advisoryStore.getByPackage('mustache')
    firstLookup.pop()
    const secondLookup = await advisoryStore.getByPackage('mustache')
    expect(secondLookup).toHaveLength(1)
  })

  test('exposes the snapshot', () => {
    expect(advisoryStore.snapshot.entryCount).toBe(realOsvFixtureNames.length)
  })

  test('fails with the fix when the cache is missing', async () => {
    const emptyDirectory = await mkdtemp(
      join(tmpdir(), 'advisory-store-empty-'),
    )
    expect(loadAdvisoryStore(emptyDirectory)).rejects.toThrow(
      'bun run refresh-advisories',
    )
    await rm(emptyDirectory, { recursive: true, force: true })
  })
})

describe('isSnapshotOlderThan', () => {
  // build a snapshot fetched the given number of hours ago
  function snapshotFetchedHoursAgo(hours: number): AdvisorySnapshot {
    const fetchedAt = new Date(Date.now() - hours * 60 * 60 * 1000)
    return {
      fetchedAt: fetchedAt.toISOString(),
      sourceUrl:
        'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip',
      entryCount: 1,
      sha256: '0'.repeat(64),
    }
  }

  test('reports a snapshot older than the limit', () => {
    expect(isSnapshotOlderThan(snapshotFetchedHoursAgo(25), 24)).toBe(true)
  })

  test('reports a recent snapshot as fresh', () => {
    expect(isSnapshotOlderThan(snapshotFetchedHoursAgo(1), 24)).toBe(false)
  })
})
