// refreshes the npm advisory cache from OSV, then loads it once and reports how long the load took
import { resolveCacheDirectory } from '@/shared/cache-directory'
import { loadAdvisoryStore } from './advisory-store'
import { refreshAdvisories } from './refresh-advisories'

/**
 * Refreshes the npm advisories under the shared cache directory and prints what was written and the store load time.
 */
export async function runRefreshAdvisoriesCommand(): Promise<void> {
  // refresh the cache
  const cacheDir = resolveCacheDirectory()
  const refreshStartedAt = performance.now()
  const refreshAdvisoriesResult = await refreshAdvisories({
    ecosystem: 'npm',
    cacheDir,
  })
  const refreshMilliseconds = performance.now() - refreshStartedAt

  // load the new index once to measure the load time
  const loadStartedAt = performance.now()
  await loadAdvisoryStore(cacheDir)
  const loadMilliseconds = performance.now() - loadStartedAt

  // report the result
  const { snapshot, indexPath, packageCount } = refreshAdvisoriesResult
  console.log(
    `refreshed ${snapshot.entryCount} advisories for ${packageCount} packages`,
  )
  console.log(`index: ${indexPath}`)
  console.log(`snapshot sha256: ${snapshot.sha256}`)
  console.log(`refresh took ${Math.round(refreshMilliseconds)} ms`)
  console.log(`store load took ${Math.round(loadMilliseconds)} ms`)
}

// run when invoked as a script and exit non-zero on any failure
if (import.meta.main) {
  try {
    await runRefreshAdvisoriesCommand()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
