// tests the load-advisories step offline and online. a store that is not needed is never loaded
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAdvisories } from './advisory-step'
import { testReviewOptions } from './pipeline-fixtures'

// the committed advisory fixture. its snapshot is older than a stale limit of a few hours
const fixtureCacheDirectory = testReviewOptions.advisoryCacheDir

// an empty cache directory for the current test
let emptyCacheDirectory: string

beforeEach(async () => {
  emptyCacheDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-advisories-'),
  )
})

afterEach(async () => {
  await rm(emptyCacheDirectory, { recursive: true, force: true })
})

// a refresh that copies the committed fixture into the cache and counts its calls
function createFixtureRefresh(): {
  refreshAdvisoryCache: (cacheDir: string) => Promise<void>
  refreshCount: () => number
} {
  let refreshCallCount = 0
  return {
    refreshCount: () => refreshCallCount,
    async refreshAdvisoryCache(cacheDir: string): Promise<void> {
      refreshCallCount += 1
      await cp(
        join(fixtureCacheDirectory, 'advisories', 'npm'),
        join(cacheDir, 'advisories', 'npm'),
        {
          recursive: true,
        },
      )
    },
  }
}

describe('loadAdvisories', () => {
  test('loads nothing when no lockfile changed', async () => {
    const fixtureRefresh = createFixtureRefresh()
    const advisoryLoad = await loadAdvisories({
      isNeeded: false,
      advisoryCacheDir: emptyCacheDirectory,
      advisoryStaleHours: 24,
      isOffline: false,
      refreshAdvisoryCache: fixtureRefresh.refreshAdvisoryCache,
    })

    expect(advisoryLoad).toEqual({ kind: 'not-needed' })
    expect(fixtureRefresh.refreshCount()).toBe(0)
  })

  test('uses a stale cache as it is when offline', async () => {
    const advisoryLoad = await loadAdvisories({
      isNeeded: true,
      advisoryCacheDir: fixtureCacheDirectory,
      advisoryStaleHours: 0.001,
      isOffline: true,
    })

    expect(advisoryLoad.kind).toBe('loaded')
    expect(advisoryLoad.kind === 'loaded' && advisoryLoad.isRefreshed).toBe(
      false,
    )
  })

  test('fails offline when there is no cache', async () => {
    const advisoryLoad = loadAdvisories({
      isNeeded: true,
      advisoryCacheDir: emptyCacheDirectory,
      advisoryStaleHours: 24,
      isOffline: true,
    })

    await expect(advisoryLoad).rejects.toThrow('the run is offline')
  })

  test('refreshes a missing cache when online', async () => {
    const fixtureRefresh = createFixtureRefresh()
    const advisoryLoad = await loadAdvisories({
      isNeeded: true,
      advisoryCacheDir: emptyCacheDirectory,
      advisoryStaleHours: 24 * 365 * 100,
      isOffline: false,
      refreshAdvisoryCache: fixtureRefresh.refreshAdvisoryCache,
    })

    expect(fixtureRefresh.refreshCount()).toBe(1)
    expect(advisoryLoad.kind === 'loaded' && advisoryLoad.isRefreshed).toBe(
      true,
    )
  })

  test('refreshes a stale cache and keeps a fresh one when online', async () => {
    // a stale limit far in the past keeps the fixture fresh
    const freshRefresh = createFixtureRefresh()
    await loadAdvisories({
      isNeeded: true,
      advisoryCacheDir: fixtureCacheDirectory,
      advisoryStaleHours: 24 * 365 * 100,
      isOffline: false,
      refreshAdvisoryCache: freshRefresh.refreshAdvisoryCache,
    })
    expect(freshRefresh.refreshCount()).toBe(0)

    // a tiny stale limit refreshes a copy of the fixture
    await createFixtureRefresh().refreshAdvisoryCache(emptyCacheDirectory)
    const staleRefresh = createFixtureRefresh()
    await loadAdvisories({
      isNeeded: true,
      advisoryCacheDir: emptyCacheDirectory,
      advisoryStaleHours: 0.001,
      isOffline: false,
      refreshAdvisoryCache: staleRefresh.refreshAdvisoryCache,
    })
    expect(staleRefresh.refreshCount()).toBe(1)
  })
})
