// the npm package name rule for matching installed package names against advisory data

/**
 * Returns the npm package name trimmed and lowercased, the form advisory lookups compare names in.
 */
export function normalizePackageName(packageName: string): string {
  return packageName.trim().toLowerCase()
}
