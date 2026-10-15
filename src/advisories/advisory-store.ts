// loads the cached advisory index into memory and serves it through the AdvisoryStore contract
import { z } from 'zod'
import {
  type AdvisorySnapshot,
  type AdvisoryStore,
  advisorySchema,
  advisorySnapshotSchema,
} from '@/shared/advisory'
import { resolveAdvisoryCachePaths } from './cache-layout'
import { normalizePackageName } from './package-name'

// the advisories a lookup returns, checked against the contract on the way out
const packageAdvisoriesSchema = z.array(advisorySchema)

// the milliseconds in one hour
const millisecondsPerHour = 60 * 60 * 1000

/**
 * Loads the npm advisory index and snapshot under the cache directory into an in-memory AdvisoryStore.
 */
export async function loadAdvisoryStore(
  cacheDir: string,
): Promise<AdvisoryStore> {
  // locate both files and fail with the fix when the cache was never built
  const { indexPath, snapshotPath } = resolveAdvisoryCachePaths({
    cacheDir,
    ecosystem: 'npm',
  })
  const indexFile = Bun.file(indexPath)
  const snapshotFile = Bun.file(snapshotPath)
  if (!(await indexFile.exists()) || !(await snapshotFile.exists())) {
    throw new Error(
      `no advisory cache under ${cacheDir}. run bun run refresh-advisories first`,
    )
  }

  // read the snapshot through its schema and the index as a map from package name to advisories
  const snapshot = advisorySnapshotSchema.parse(await snapshotFile.json())
  const indexObject: Record<string, unknown> = await indexFile.json()
  const advisoriesByPackage = new Map(Object.entries(indexObject))

  return {
    snapshot,
    async getByPackage(packageName) {
      const storedAdvisories = advisoriesByPackage.get(
        normalizePackageName(packageName),
      )
      return packageAdvisoriesSchema.parse(storedAdvisories ?? [])
    },
  }
}

/**
 * Says whether a snapshot was fetched more than the given number of hours ago.
 */
export function isSnapshotOlderThan(
  snapshot: AdvisorySnapshot,
  hours: number,
): boolean {
  const snapshotAgeMilliseconds = Date.now() - Date.parse(snapshot.fetchedAt)
  return snapshotAgeMilliseconds > hours * millisecondsPerHour
}
