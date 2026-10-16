// lists the source files under a root without following a symbolic link, leaving the root or entering an excluded directory
import type { Dirent } from 'node:fs'
import { readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'

// the file names scanned for imports: ts, tsx, mts, cts, js, jsx, mjs and cjs
const sourceFileNameGlob = new Bun.Glob('*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}')

// the directory names never scanned, at any depth
export const excludedDirectoryNames: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'cache',
  'runs',
])

// the directory to walk and the most files to return
export interface ListSourceFilesOptions {
  rootDirectory: string
  maxFileCount: number
}

// the resolved root, the absolute paths of the files found under it, whether the walk stopped at the cap, and the directories it could not read
export interface SourceFileListing {
  realRootDirectory: string
  filePaths: string[]
  isFileCapReached: boolean
  warnings: string[]
}

/**
 * Lists the source files under rootDirectory breadth first in name order, stopping once maxFileCount files are found.
 */
export async function listSourceFiles({
  rootDirectory,
  maxFileCount,
}: ListSourceFilesOptions): Promise<SourceFileListing> {
  const realRootDirectory = await realpath(rootDirectory)
  const filePaths: string[] = []
  const warnings: string[] = []
  const pendingDirectories = [realRootDirectory]

  // visit each directory once, queueing its subdirectories as they are found
  for (const directory of pendingDirectories) {
    const directoryEntries = await readDirectoryEntries({ directory, warnings })
    for (const directoryEntry of directoryEntries) {
      const entryPath = join(directory, directoryEntry.name)

      // descend into a directory unless its name is excluded
      if (isWalkableDirectory(directoryEntry)) {
        pendingDirectories.push(entryPath)
        continue
      }
      if (!isSourceFile(directoryEntry)) {
        continue
      }

      // stop at the cap once one more file is waiting
      if (filePaths.length >= maxFileCount) {
        return {
          realRootDirectory,
          filePaths,
          isFileCapReached: true,
          warnings,
        }
      }

      // keep the file only when its real path stays inside the root
      const isInsideRoot = await isRealPathInsideRoot({
        filePath: entryPath,
        realRootDirectory,
      })
      if (isInsideRoot) {
        filePaths.push(entryPath)
      }
    }
  }
  return { realRootDirectory, filePaths, isFileCapReached: false, warnings }
}

// the directory to read and the warnings to add to when it cannot be read
interface ReadDirectoryEntriesOptions {
  directory: string
  warnings: string[]
}

// read a directory's entries in name order, recording a warning instead of failing when it cannot be read
async function readDirectoryEntries({
  directory,
  warnings,
}: ReadDirectoryEntriesOptions): Promise<Dirent[]> {
  try {
    const directoryEntries = await readdir(directory, { withFileTypes: true })
    return directoryEntries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`skipped an unreadable directory: ${message}`)
    return []
  }
}

// tell whether an entry is a real directory the walk may enter. a symbolic link is never one
function isWalkableDirectory(directoryEntry: Dirent): boolean {
  if (directoryEntry.isSymbolicLink() || !directoryEntry.isDirectory()) {
    return false
  }
  return !excludedDirectoryNames.has(directoryEntry.name)
}

// tell whether an entry is a regular file with a source extension. a symbolic link is never one
function isSourceFile(directoryEntry: Dirent): boolean {
  if (directoryEntry.isSymbolicLink() || !directoryEntry.isFile()) {
    return false
  }
  return sourceFileNameGlob.match(directoryEntry.name)
}

// the file to check and the resolved root it must stay inside
interface IsRealPathInsideRootOptions {
  filePath: string
  realRootDirectory: string
}

// resolve a file's real path and tell whether it is inside the root
async function isRealPathInsideRoot({
  filePath,
  realRootDirectory,
}: IsRealPathInsideRootOptions): Promise<boolean> {
  const realFilePath = await realpath(filePath)
  const relativePath = relative(realRootDirectory, realFilePath)
  return !relativePath.startsWith('..') && !isAbsolute(relativePath)
}
