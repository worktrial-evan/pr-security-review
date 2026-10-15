// writes the committed benchmark subset of advisories from a full advisory cache
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Advisory,
  type AdvisorySnapshot,
  advisorySnapshotSchema,
} from '@/shared/advisory'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import { loadAdvisoryStore } from './advisory-store'
import { resolveAdvisoryCachePaths } from './cache-layout'
import { normalizePackageName } from './package-name'

// the packages the benchmark cases use, plus mustache for a withdrawn entry, xmldom for a last_affected range and faker.js for an entry github has not reviewed
export const benchmarkAdvisoryPackageNames = [
  'lodash',
  'minimist',
  'node-fetch',
  'express',
  'ws',
  'jsonwebtoken',
  'axios',
  'semver',
  'tar',
  'qs',
  'moment',
  'underscore',
  'handlebars',
  'ejs',
  'marked',
  'mustache',
  'xmldom',
  'faker.js',
] as const

// the directory the subset is written under, laid out like a cache directory
export const benchmarkAdvisoryCacheDir = join(
  import.meta.dir,
  '..',
  '..',
  'benchmark',
  'fixtures',
)

// where to read the full cache, where to write the subset and which packages to keep
export interface WriteAdvisorySubsetOptions {
  sourceCacheDir: string
  targetCacheDir: string
  packageNames: readonly string[]
}

/**
 * Copies the advisories of the given packages from a full cache into a subset with its own snapshot, formatted for the repository.
 */
export async function writeAdvisorySubset({
  sourceCacheDir,
  targetCacheDir,
  packageNames,
}: WriteAdvisorySubsetOptions): Promise<AdvisorySnapshot> {
  // look up every package in the full cache, keyed by its normalized name
  const sourceStore = await loadAdvisoryStore(sourceCacheDir)
  const sortedPackageNames = packageNames.map(normalizePackageName).toSorted()
  const subsetIndex: Record<string, Advisory[]> = {}
  for (const packageName of sortedPackageNames) {
    subsetIndex[packageName] = await sourceStore.getByPackage(packageName)
  }

  // keep the source snapshot's date, url and digest, and count the advisories in the subset
  const subsetAdvisoryIds = new Set(
    Object.values(subsetIndex)
      .flat()
      .map((advisory) => advisory.id),
  )
  const subsetSnapshot = advisorySnapshotSchema.parse({
    ...sourceStore.snapshot,
    entryCount: subsetAdvisoryIds.size,
  })

  // write both files in the cache layout and format them the way biome checks them
  const { ecosystemDirectory, indexPath, snapshotPath } =
    resolveAdvisoryCachePaths({ cacheDir: targetCacheDir, ecosystem: 'npm' })
  await mkdir(ecosystemDirectory, { recursive: true })
  await Bun.write(indexPath, JSON.stringify(subsetIndex))
  await Bun.write(snapshotPath, JSON.stringify(subsetSnapshot))
  await Bun.$`bunx biome format --write ${indexPath} ${snapshotPath}`.quiet()
  return subsetSnapshot
}

// regenerate the committed subset from the shared cache when invoked as a script
if (import.meta.main) {
  const subsetSnapshot = await writeAdvisorySubset({
    sourceCacheDir: resolveCacheDirectory(),
    targetCacheDir: benchmarkAdvisoryCacheDir,
    packageNames: benchmarkAdvisoryPackageNames,
  })
  console.log(
    `wrote ${subsetSnapshot.entryCount} advisories from the snapshot fetched at ${subsetSnapshot.fetchedAt}`,
  )
}
