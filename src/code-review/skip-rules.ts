// decides which changed files stay out of the review packet: binary files, deleted files, lockfiles, generated files and files with no added lines
import type { ChangedFile } from '@/shared/pull-request-source'

// why a changed file stays out of the packet, in the order the checks run
export const skipReasons = [
  'binary',
  'deleted',
  'lockfile',
  'generated',
  'no-added-lines',
] as const
export type SkipReason = (typeof skipReasons)[number]

// the file names of the lockfiles the review never reads
const lockfileNames = new Set<string>([
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'composer.lock',
  'Pipfile.lock',
  'go.sum',
])

// the path segments that hold generated code
const generatedSegments = new Set<string>([
  'node_modules',
  'dist',
  'build',
  'vendor',
  '__snapshots__',
  '__generated__',
])

// the file name endings of generated files
const generatedFileNameSuffixes = [
  '.min.js',
  '.min.css',
  '.map',
  '.snap',
  '.pb.go',
  '_pb2.py',
]

// the text a generated file name contains
const generatedFileNameInfix = '.generated.'

/**
 * Returns why a changed file stays out of the review packet, or null when it is reviewed.
 */
export function findSkipReason(changedFile: ChangedFile): SkipReason | null {
  if (changedFile.isBinary) {
    return 'binary'
  }
  if (changedFile.status === 'deleted') {
    return 'deleted'
  }
  if (isLockfile(changedFile.path)) {
    return 'lockfile'
  }
  if (isGeneratedPath(changedFile.path)) {
    return 'generated'
  }
  if (!hasAddedLine(changedFile)) {
    return 'no-added-lines'
  }
  return null
}

// tell whether the file name of a path is a lockfile
function isLockfile(path: string): boolean {
  return lockfileNames.has(readFileName(path))
}

// tell whether a path has a generated segment or a generated file name
function isGeneratedPath(path: string): boolean {
  const segments = path.split('/')
  const hasGeneratedSegment = segments.some((segment) =>
    generatedSegments.has(segment),
  )
  if (hasGeneratedSegment) {
    return true
  }
  return isGeneratedFileName(readFileName(path))
}

// tell whether a file name ends in a generated suffix or contains the generated infix
function isGeneratedFileName(fileName: string): boolean {
  const hasGeneratedSuffix = generatedFileNameSuffixes.some((suffix) =>
    fileName.endsWith(suffix),
  )
  if (hasGeneratedSuffix) {
    return true
  }
  return fileName.includes(generatedFileNameInfix)
}

// tell whether a file lists an added line and some hunk line is added
function hasAddedLine(changedFile: ChangedFile): boolean {
  if (changedFile.addedLines.length === 0) {
    return false
  }
  return changedFile.hunks.some((hunk) =>
    hunk.lines.some((hunkLine) => hunkLine.kind === 'added'),
  )
}

// return the file name: the last segment of a path split on slashes
function readFileName(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] ?? path
}
