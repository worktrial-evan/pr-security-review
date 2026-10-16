// the load-advisories step. it loads the advisory store when a lockfile changed. a missing or stale snapshot is refreshed unless the run is offline
import {
  isSnapshotOlderThan,
  loadAdvisoryStore,
} from '@/advisories/advisory-store'
import { refreshAdvisories } from '@/advisories/refresh-advisories'
import type { AdvisoryStore } from '@/shared/advisory'

// the store when it was needed and loaded. otherwise a record that it was not needed
export type AdvisoryLoad =
  | { kind: 'not-needed' }
  | { kind: 'loaded'; advisoryStore: AdvisoryStore; isRefreshed: boolean }

// refreshes the advisory cache under a directory
export type RefreshAdvisoryCache = (cacheDir: string) => Promise<void>

// whether the store is needed and where it lives. also how old it may be and whether the network may be used
export interface LoadAdvisoriesOptions {
  isNeeded: boolean
  advisoryCacheDir: string
  advisoryStaleHours: number
  isOffline: boolean
  refreshAdvisoryCache?: RefreshAdvisoryCache
}

/**
 * Loads the advisory store when it is needed. A missing or stale cache is refreshed first unless the run is offline.
 */
export async function loadAdvisories({
  isNeeded,
  advisoryCacheDir,
  advisoryStaleHours,
  isOffline,
  refreshAdvisoryCache = refreshNpmAdvisoryCache,
}: LoadAdvisoriesOptions): Promise<AdvisoryLoad> {
  // skip the index entirely when no lockfile changed
  if (!isNeeded) {
    return { kind: 'not-needed' }
  }

  // load what is cached. offline a missing cache is an error and a stale one is used as it is
  const cachedAdvisoryStore = await tryLoadAdvisoryStore(advisoryCacheDir)
  if (isOffline) {
    if (cachedAdvisoryStore === undefined) {
      throw new Error(
        `no advisory cache under ${advisoryCacheDir} and the run is offline`,
      )
    }
    return {
      kind: 'loaded',
      advisoryStore: cachedAdvisoryStore,
      isRefreshed: false,
    }
  }

  // use a fresh cache as it is
  const isFresh =
    cachedAdvisoryStore !== undefined &&
    !isSnapshotOlderThan(cachedAdvisoryStore.snapshot, advisoryStaleHours)
  if (isFresh) {
    return {
      kind: 'loaded',
      advisoryStore: cachedAdvisoryStore,
      isRefreshed: false,
    }
  }

  // refresh a missing or stale cache and load the new one
  await refreshAdvisoryCache(advisoryCacheDir)
  const advisoryStore = await loadAdvisoryStore(advisoryCacheDir)
  return { kind: 'loaded', advisoryStore, isRefreshed: true }
}

// load the store. return undefined when the cache has never been built
async function tryLoadAdvisoryStore(
  advisoryCacheDir: string,
): Promise<AdvisoryStore | undefined> {
  try {
    return await loadAdvisoryStore(advisoryCacheDir)
  } catch {
    return undefined
  }
}

// download the npm advisories from OSV into the cache
async function refreshNpmAdvisoryCache(cacheDir: string): Promise<void> {
  await refreshAdvisories({ ecosystem: 'npm', cacheDir })
}
