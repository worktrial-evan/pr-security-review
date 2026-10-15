// lists the npm packages an advisory affects, under the shared package name rule
import type { Advisory } from '@/shared/advisory'
import { normalizePackageName } from '@/shared/package-name'

// the OSV ecosystem name for npm packages
export const npmEcosystem = 'npm'

/**
 * Returns the normalized names of the npm packages an advisory affects, each name once.
 */
export function listAffectedNpmPackageNames(advisory: Advisory): string[] {
  // keep the npm packages and drop the other ecosystems
  const npmPackages = advisory.affected.filter(
    (affectedPackage) => affectedPackage.ecosystem === npmEcosystem,
  )

  // normalize the names and drop duplicates
  const normalizedNames = npmPackages.map((affectedPackage) =>
    normalizePackageName(affectedPackage.name),
  )
  return [...new Set(normalizedNames)]
}
