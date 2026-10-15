// the one rule for comparing npm package names, shared by every module that keys data by package name

/**
 * Returns the npm package name trimmed and lowercased, the form every package-name key uses.
 */
export function normalizePackageName(packageName: string): string {
  return packageName.trim().toLowerCase()
}
