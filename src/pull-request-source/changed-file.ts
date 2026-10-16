// builds the changed file values both pull request sources return and orders files by path
import { compareStrings } from '@/shared/compare-strings'
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

// a file the sources order: anything with a path
export interface FileWithPath {
  path: string
}

/**
 * Sorts files in place by path, comparing code units.
 */
export function sortFilesByPath<T extends FileWithPath>(files: T[]): T[] {
  return files.sort((first, second) =>
    compareStrings({ first: first.path, second: second.path }),
  )
}
