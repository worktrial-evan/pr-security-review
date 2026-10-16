// the collect-files step: lists the changed files and withholds the ones past the file count or byte limits from the detectors
import type {
  ChangedFile,
  PullRequestSource,
} from '@/shared/pull-request-source'
import type { ReviewLimits } from './review-settings'

// why a file is kept from secrets and code review
export const withheldFileReasons = [
  'over-max-changed-files',
  'over-max-file-bytes',
] as const
export type WithheldFileReason = (typeof withheldFileReasons)[number]

// a changed file the detectors do not read and the reason
export interface WithheldFile {
  path: string
  reason: WithheldFileReason
}

// every changed file split into the files the detectors read and the files withheld
export interface CollectedFiles {
  changedFiles: ChangedFile[]
  reviewedFiles: ChangedFile[]
  withheldFiles: WithheldFile[]
}

// the source to read and the limits to apply
export interface CollectFilesOptions {
  pullRequestSource: PullRequestSource
  limits: ReviewLimits
}

/**
 * Lists the changed files and splits them into the files the detectors read and the files withheld by the limits.
 */
export async function collectFiles({
  pullRequestSource,
  limits,
}: CollectFilesOptions): Promise<CollectedFiles> {
  const changedFiles = await pullRequestSource.listChangedFiles()
  return { changedFiles, ...applyFileLimits({ changedFiles, limits }) }
}

// the files to split and the limits to split them by
export interface ApplyFileLimitsOptions {
  changedFiles: ChangedFile[]
  limits: Pick<ReviewLimits, 'maxChangedFiles' | 'maxFileBytes'>
}

/**
 * Keeps the first maxChangedFiles files within maxFileBytes each and withholds the rest.
 */
export function applyFileLimits({
  changedFiles,
  limits,
}: ApplyFileLimitsOptions): Omit<CollectedFiles, 'changedFiles'> {
  const reviewedFiles: ChangedFile[] = []
  const withheldFiles: WithheldFile[] = []

  // withhold every file past the count limit. then withhold every file over the byte limit
  for (const [fileIndex, changedFile] of changedFiles.entries()) {
    if (fileIndex >= limits.maxChangedFiles) {
      withheldFiles.push({
        path: changedFile.path,
        reason: 'over-max-changed-files',
      })
      continue
    }
    if (countHunkBytes(changedFile) > limits.maxFileBytes) {
      withheldFiles.push({
        path: changedFile.path,
        reason: 'over-max-file-bytes',
      })
      continue
    }
    reviewedFiles.push(changedFile)
  }

  return { reviewedFiles, withheldFiles }
}

/**
 * Returns the UTF-8 byte count of every hunk line of a changed file, the text the detectors read.
 */
export function countHunkBytes(changedFile: ChangedFile): number {
  let byteCount = 0
  for (const hunk of changedFile.hunks) {
    for (const hunkLine of hunk.lines) {
      byteCount += Buffer.byteLength(hunkLine.text, 'utf8')
    }
  }
  return byteCount
}
