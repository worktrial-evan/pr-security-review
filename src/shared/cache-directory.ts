// resolves the directory that holds the caches. caches live outside the repo so every worktree shares them
import { homedir } from 'node:os'
import { join } from 'node:path'

// the environment variable that overrides the cache directory
export const cacheDirectoryEnvironmentVariable = 'PULL_REQUEST_REVIEW_CACHE_DIR'

/**
 * Returns the cache directory from the environment or the default under the home directory.
 */
export function resolveCacheDirectory(): string {
  // prefer the directory named by the environment variable
  const configuredCacheDirectory =
    process.env[cacheDirectoryEnvironmentVariable]
  if (
    configuredCacheDirectory !== undefined &&
    configuredCacheDirectory !== ''
  ) {
    return configuredCacheDirectory
  }

  // fall back to the shared cache under the home directory
  return join(homedir(), '.cache', 'pull-request-review')
}
