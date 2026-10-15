// tests the refresh against archives zipped from the OSV fixtures and served locally, and against OSV itself when network tests are on
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { advisorySchema, advisorySnapshotSchema } from '@/shared/advisory'
import { resolveAdvisoryCachePaths } from './cache-layout'
import {
  type OsvFixtureName,
  osvFixtureNames,
  readOsvFixture,
} from './osv-fixtures'
import { AdvisoryParseError, refreshAdvisories } from './refresh-advisories'

// the archive the local server returns, swapped by each test
let servedArchive: Uint8Array = new Uint8Array()

// a local server that returns the current archive, or a 404 on the missing path
const archiveServer = Bun.serve({
  port: 0,
  fetch(request) {
    if (new URL(request.url).pathname === '/missing.zip') {
      return new Response('not found', { status: 404 })
    }
    return new Response(servedArchive)
  },
})
const archiveUrl = new URL('/all.zip', archiveServer.url).href

// a fresh cache directory per test
let cacheDir = ''
beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'advisories-refresh-'))
})
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true })
  cacheDir = await mkdtemp(join(tmpdir(), 'advisories-refresh-'))
})
afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true })
  archiveServer.stop(true)
})

// zip entries the way the OSV export does: one JSON file per advisory. the position prefix keeps entries that share an id apart
function zipEntries(entries: Record<string, unknown>[]): Uint8Array {
  const textEncoder = new TextEncoder()
  const archiveFiles = Object.fromEntries(
    entries.map((entry, i) => [
      `${i}-${String(entry.id)}.json`,
      textEncoder.encode(JSON.stringify(entry)),
    ]),
  )
  return zipSync(archiveFiles)
}

// read the named fixtures as OSV entries
async function readOsvFixtures(
  fixtureNames: readonly OsvFixtureName[],
): Promise<Record<string, unknown>[]> {
  return Promise.all(fixtureNames.map(readOsvFixture))
}

describe('refreshAdvisories', () => {
  test('writes the index and a snapshot of the archive', async () => {
    // serve three entries
    const osvEntries = await readOsvFixtures([
      'cvss-v3-and-v4',
      'withdrawn',
      'uppercase-name',
    ])
    servedArchive = zipEntries(osvEntries)
    const now = new Date('2026-10-15T06:00:00.000Z')

    const refreshAdvisoriesResult = await refreshAdvisories({
      ecosystem: 'npm',
      cacheDir,
      sourceUrl: archiveUrl,
      now,
    })

    // the snapshot describes the archive
    const expectedSha256 = new Bun.CryptoHasher('sha256')
      .update(servedArchive)
      .digest('hex')
    const snapshotOnDisk = advisorySnapshotSchema.parse(
      await Bun.file(refreshAdvisoriesResult.snapshotPath).json(),
    )
    expect(snapshotOnDisk).toEqual({
      fetchedAt: '2026-10-15T06:00:00.000Z',
      sourceUrl: archiveUrl,
      entryCount: 3,
      sha256: expectedSha256,
    })

    // the index sits in the cache layout and holds every npm package once
    const { indexPath } = resolveAdvisoryCachePaths({
      cacheDir,
      ecosystem: 'npm',
    })
    expect(refreshAdvisoriesResult.indexPath).toBe(indexPath)
    const indexOnDisk = await Bun.file(indexPath).json()
    expect(Object.keys(indexOnDisk)).toEqual([
      'haraka',
      'lodash',
      'lodash-amd',
      'lodash-es',
      'lodash.unset',
      'mustache',
    ])
  })

  test('writes advisories that pass the contract for every fixture', async () => {
    servedArchive = zipEntries(await readOsvFixtures(osvFixtureNames))

    const refreshAdvisoriesResult = await refreshAdvisories({
      ecosystem: 'npm',
      cacheDir,
      sourceUrl: archiveUrl,
    })

    // every stored advisory parses against the contract
    const indexOnDisk: Record<string, unknown[]> = await Bun.file(
      refreshAdvisoriesResult.indexPath,
    ).json()
    const storedAdvisories = Object.values(indexOnDisk).flat()
    for (const storedAdvisory of storedAdvisories) {
      expect(advisorySchema.safeParse(storedAdvisory).success).toBe(true)
    }
    expect(refreshAdvisoriesResult.snapshot.entryCount).toBe(
      osvFixtureNames.length,
    )
    expect(indexOnDisk['faker.js']).toHaveLength(1)
    expect(indexOnDisk.phoenix).toHaveLength(1)
  })

  test('fails on a malformed entry and keeps the previous cache', async () => {
    // build a good cache first
    servedArchive = zipEntries(await readOsvFixtures(['withdrawn']))
    const refreshAdvisoriesResult = await refreshAdvisories({
      ecosystem: 'npm',
      cacheDir,
      sourceUrl: archiveUrl,
    })
    const indexBefore = await Bun.file(refreshAdvisoriesResult.indexPath).text()
    const snapshotBefore = await Bun.file(
      refreshAdvisoriesResult.snapshotPath,
    ).text()

    // serve a valid entry beside one with an unknown range type
    const validEntry = await readOsvFixture('cvss-v4-only')
    const malformedEntry = structuredClone(
      await readOsvFixture('uppercase-name'),
    ) as { affected: { ranges: { type: string }[] }[] }
    const firstRange = malformedEntry.affected[0]?.ranges[0]
    if (firstRange === undefined) {
      throw new Error('the uppercase-name fixture has no range')
    }
    firstRange.type = 'CALVER'
    servedArchive = zipEntries([validEntry, malformedEntry])

    // the refresh rejects and names the malformed entry
    const refreshPromise = refreshAdvisories({
      ecosystem: 'npm',
      cacheDir,
      sourceUrl: archiveUrl,
    })
    expect(refreshPromise).rejects.toBeInstanceOf(AdvisoryParseError)
    expect(refreshPromise).rejects.toThrow('GHSA-w5m8-5v9m-xhx5.json')
    await refreshPromise.catch(() => undefined)

    // both files are unchanged
    expect(await Bun.file(refreshAdvisoriesResult.indexPath).text()).toBe(
      indexBefore,
    )
    expect(await Bun.file(refreshAdvisoriesResult.snapshotPath).text()).toBe(
      snapshotBefore,
    )
  })

  test('fails on an entry that is not JSON', async () => {
    servedArchive = zipSync({
      'GHSA-broken.json': new TextEncoder().encode('{ not json'),
    })
    expect(
      refreshAdvisories({ ecosystem: 'npm', cacheDir, sourceUrl: archiveUrl }),
    ).rejects.toThrow('GHSA-broken.json')
  })

  test('fails when the download fails', async () => {
    const missingUrl = new URL('/missing.zip', archiveServer.url).href
    expect(
      refreshAdvisories({ ecosystem: 'npm', cacheDir, sourceUrl: missingUrl }),
    ).rejects.toThrow('status 404')
  })
})

// the real export is large, so this runs only when network tests are on
describe.skipIf(process.env.RUN_NETWORK_TESTS !== '1')(
  'refreshAdvisories against OSV',
  () => {
    test(
      'refreshes the npm export',
      async () => {
        const refreshAdvisoriesResult = await refreshAdvisories({
          ecosystem: 'npm',
          cacheDir,
        })
        expect(refreshAdvisoriesResult.snapshot.entryCount).toBeGreaterThan(
          100000,
        )
        const indexOnDisk = await Bun.file(
          refreshAdvisoriesResult.indexPath,
        ).json()
        expect(indexOnDisk.lodash.length).toBeGreaterThan(0)
      },
      { timeout: 600000 },
    )
  },
)
