// names where the advisory index and snapshot live under a cache directory
import { join } from 'node:path'

// the ecosystems the advisory cache holds
export const advisoryEcosystems = ['npm'] as const
export type AdvisoryEcosystem = (typeof advisoryEcosystems)[number]

// the paths of one ecosystem's advisory files
export interface AdvisoryCachePaths {
  ecosystemDirectory: string
  indexPath: string
  snapshotPath: string
}

// the cache directory and the ecosystem whose files to locate
export interface ResolveAdvisoryCachePathsOptions {
  cacheDirectory: string
  ecosystem: AdvisoryEcosystem
}

/**
 * Returns the index and snapshot paths of an ecosystem under advisories in the cache directory.
 */
export function resolveAdvisoryCachePaths({
  cacheDirectory,
  ecosystem,
}: ResolveAdvisoryCachePathsOptions): AdvisoryCachePaths {
  const ecosystemDirectory = join(cacheDirectory, 'advisories', ecosystem)
  return {
    ecosystemDirectory,
    indexPath: join(ecosystemDirectory, 'index.json'),
    snapshotPath: join(ecosystemDirectory, 'snapshot.json'),
  }
}

/**
 * Returns the URL of the OSV bulk export for an ecosystem.
 */
export function resolveOsvArchiveUrl(ecosystem: AdvisoryEcosystem): string {
  return `https://osv-vulnerabilities.storage.googleapis.com/${ecosystem}/all.zip`
}
