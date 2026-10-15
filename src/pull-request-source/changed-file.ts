// builds and orders the changed file values both pull request sources return
import type { ChangedFile } from '@/shared/pull-request-source'

// a changed file whose previous path may be undefined
export type ChangedFileFields = Omit<ChangedFile, 'previousPath'> & {
  previousPath: string | undefined
}

/**
 * Creates a changed file, leaving previousPath out unless the file was renamed.
 */
export function createChangedFile({
  previousPath,
  ...changedFileFields
}: ChangedFileFields): ChangedFile {
  if (previousPath === undefined) {
    return changedFileFields
  }
  return { ...changedFileFields, previousPath }
}

/**
 * Sorts changed files in place by path.
 */
export function sortChangedFiles(changedFiles: ChangedFile[]): ChangedFile[] {
  return changedFiles.sort((first, second) =>
    comparePaths(first.path, second.path),
  )
}

/**
 * Compares two paths by code unit, the way git orders paths.
 */
export function comparePaths(firstPath: string, secondPath: string): number {
  if (firstPath === secondPath) {
    return 0
  }
  return firstPath < secondPath ? -1 : 1
}
