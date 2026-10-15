// normalizes npm package names so the advisory index and every lookup compare names the same way
import type { Advisory } from '@/shared/advisory'

// the OSV ecosystem name for npm packages
export const npmEcosystem = 'npm'

/**
 * Returns the package name trimmed and lowercased, the form the advisory index is keyed by.
 */
export function normalizePackageName(packageName: string): string {
  return packageName.trim().toLowerCase()
}

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
