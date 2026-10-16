// assembles the review packet: validates the input, sorts and filters the changed files, caps hunk context, renders hunks into numbered lines, packs them into chunks and hashes the chunk texts
import { compareStrings } from '@/shared/compare-strings'
import type {
  ChangedFile,
  Hunk,
  HunkLine,
  HunkLineKind,
} from '@/shared/pull-request-source'
import { findSkipReason, type SkipReason } from './skip-rules'

// the rendered hunk lines a chunk is filled up to. a single hunk larger than that is still one chunk
export const defaultMaxChunkLines = 500

// the changed files to pack, the context lines kept around each change, and the chunk limit
export interface AssembleReviewPacketOptions {
  changedFiles: ChangedFile[]
  contextLines: number
  maxChunkLines?: number
}

// a changed file left out of the packet, with why
export interface SkippedFile {
  file: string
  reason: SkipReason
}

// one part of one file the model reviews in a single call. lineCount counts hunk lines without their headers
export interface PacketChunk {
  file: string
  chunkNumber: number
  chunkCount: number
  text: string
  lineCount: number
}

// the chunks in path order, the files left out, and the sha256 over the chunk texts in order
export interface ReviewPacket {
  hash: string
  chunks: PacketChunk[]
  skippedFiles: SkippedFile[]
}

// a hunk rendered into its header and one text line per hunk line
interface RenderedHunk {
  header: string
  lines: string[]
}

// the shape of one rendered hunk line: the head line, a space, the marker, a space and the text
export const renderedHunkLinePattern = /^(\d+) ([+ -]) (.*)$/

// the marker each hunk line kind renders with
const lineMarkers: Record<HunkLineKind, string> = {
  added: '+',
  removed: '-',
  context: ' ',
}

/**
 * Assembles the review packet from the changed files: validated, sorted, filtered, context-capped, chunked and hashed.
 */
export function assembleReviewPacket({
  changedFiles,
  contextLines,
  maxChunkLines = defaultMaxChunkLines,
}: AssembleReviewPacketOptions): ReviewPacket {
  // reject a setting out of range or a path the packet cannot render
  validatePacketInput({ changedFiles, contextLines, maxChunkLines })

  // order the files by path
  const sortedChangedFiles = sortChangedFilesByPath(changedFiles)

  // keep the reviewable files and record why the others are left out
  const { keptChangedFiles, skippedFiles } =
    splitChangedFiles(sortedChangedFiles)

  // chunk every kept file in order
  const chunks = keptChangedFiles.flatMap((changedFile) =>
    chunkChangedFile({ changedFile, contextLines, maxChunkLines }),
  )

  // hash the chunk texts in order
  const hash = hashChunkTexts(chunks)

  return { hash, chunks, skippedFiles }
}

// the changed files and the settings to check, with the chunk limit already defaulted
interface ValidatePacketInputOptions {
  changedFiles: ChangedFile[]
  contextLines: number
  maxChunkLines: number
}

// throw an error that names the setting when one is out of range, then check the paths
function validatePacketInput({
  changedFiles,
  contextLines,
  maxChunkLines,
}: ValidatePacketInputOptions): void {
  if (!Number.isInteger(contextLines) || contextLines < 0) {
    throw new Error(
      `contextLines must be a nonnegative integer, got ${contextLines}`,
    )
  }
  if (!Number.isInteger(maxChunkLines) || maxChunkLines < 1) {
    throw new Error(
      `maxChunkLines must be an integer of at least 1, got ${maxChunkLines}`,
    )
  }
  validateChangedFiles(changedFiles)
}

// throw an error that names the path when a path is empty or holds a line break, when two files share a path, or when a hunk line holds a newline
function validateChangedFiles(changedFiles: ChangedFile[]): void {
  // check each file in turn and remember its path. a repeat is rejected
  const seenPaths = new Set<string>()
  for (const changedFile of changedFiles) {
    if (changedFile.path === '') {
      throw new Error('a changed file has an empty path')
    }
    if (hasLineBreak(changedFile.path)) {
      throw new Error(
        `path ${JSON.stringify(changedFile.path)} holds a line break`,
      )
    }
    if (
      changedFile.previousPath !== undefined &&
      hasLineBreak(changedFile.previousPath)
    ) {
      throw new Error(
        `previous path ${JSON.stringify(changedFile.previousPath)} holds a line break`,
      )
    }
    if (seenPaths.has(changedFile.path)) {
      throw new Error(`path ${changedFile.path} is named twice`)
    }
    seenPaths.add(changedFile.path)
    validateHunkLineTexts(changedFile)
  }
}

// tell whether a path holds a carriage return or a newline
function hasLineBreak(path: string): boolean {
  return path.includes('\r') || path.includes('\n')
}

// throw an error that names the path and head line when a hunk line text holds a newline. a newline renders as two lines
function validateHunkLineTexts(changedFile: ChangedFile): void {
  const hunkLines = changedFile.hunks.flatMap((hunk) => hunk.lines)
  for (const hunkLine of hunkLines) {
    if (hunkLine.text.includes('\n')) {
      throw new Error(
        `path ${changedFile.path} holds a newline inside hunk line ${hunkLine.headLine}`,
      )
    }
  }
}

// order a copy of the files by path, comparing code units
function sortChangedFilesByPath(changedFiles: ChangedFile[]): ChangedFile[] {
  const sortedChangedFiles = [...changedFiles]
  sortedChangedFiles.sort((firstChangedFile, secondChangedFile) =>
    compareStrings({
      first: firstChangedFile.path,
      second: secondChangedFile.path,
    }),
  )
  return sortedChangedFiles
}

// the files that are reviewed and the files that are not
interface ChangedFileSplit {
  keptChangedFiles: ChangedFile[]
  skippedFiles: SkippedFile[]
}

// split the files into the ones to review and the ones to leave out, each with its reason
function splitChangedFiles(changedFiles: ChangedFile[]): ChangedFileSplit {
  // the two lists the split fills
  const keptChangedFiles: ChangedFile[] = []
  const skippedFiles: SkippedFile[] = []

  // apply the skip rules to each file
  for (const changedFile of changedFiles) {
    const skipReason = findSkipReason(changedFile)
    if (skipReason === null) {
      keptChangedFiles.push(changedFile)
      continue
    }
    skippedFiles.push({ file: changedFile.path, reason: skipReason })
  }

  return { keptChangedFiles, skippedFiles }
}

// one file to chunk, with the context cap and the chunk limit
interface ChunkChangedFileOptions {
  changedFile: ChangedFile
  contextLines: number
  maxChunkLines: number
}

// cap, render and pack one file's hunks into its chunks
function chunkChangedFile({
  changedFile,
  contextLines,
  maxChunkLines,
}: ChunkChangedFileOptions): PacketChunk[] {
  // cap the context of every hunk and render it
  const renderedHunks = changedFile.hunks.map((hunk) =>
    renderHunk(capHunkContext(hunk, contextLines)),
  )

  // leave out every hunk with no lines
  const nonEmptyRenderedHunks = renderedHunks.filter(
    (renderedHunk) => renderedHunk.lines.length > 0,
  )

  // fill chunks with whole hunks in order
  const hunkGroups = packRenderedHunks(nonEmptyRenderedHunks, maxChunkLines)

  // render each group with the file header lines
  return hunkGroups.map((hunkGroup, index) =>
    createPacketChunk({
      changedFile,
      hunkGroup,
      chunkNumber: index + 1,
      chunkCount: hunkGroups.length,
    }),
  )
}

// keep at most contextLines context lines before the first change and after the last one. a hunk with no change stays whole
function capHunkContext(hunk: Hunk, contextLines: number): HunkLine[] {
  // find the first and last change, and keep a hunk with no change whole
  const firstChangeIndex = hunk.lines.findIndex(
    (hunkLine) => hunkLine.kind !== 'context',
  )
  if (firstChangeIndex === -1) {
    return hunk.lines
  }
  const lastChangeIndex = hunk.lines.findLastIndex(
    (hunkLine) => hunkLine.kind !== 'context',
  )

  // cut the slice bounds contextLines before the first change and after the last
  const startIndex = Math.max(0, firstChangeIndex - contextLines)
  const endIndex = lastChangeIndex + 1 + contextLines
  return hunk.lines.slice(startIndex, endIndex)
}

// render a hunk's header and one numbered, marked line per hunk line
function renderHunk(hunkLines: HunkLine[]): RenderedHunk {
  const header = renderHunkHeader(hunkLines)
  const lines = hunkLines.map(
    (hunkLine) =>
      `${hunkLine.headLine} ${lineMarkers[hunkLine.kind]} ${hunkLine.text}`,
  )
  return { header, lines }
}

// render the header from the shown added and context lines: their first head line and their count, or +0,0 when there are none
function renderHunkHeader(hunkLines: HunkLine[]): string {
  const shownHunkLines = hunkLines.filter(
    (hunkLine) => hunkLine.kind !== 'removed',
  )
  const firstHeadLine = shownHunkLines[0]?.headLine ?? 0
  return `@@ +${firstHeadLine},${shownHunkLines.length} @@`
}

// fill groups with whole hunks in order, closing a group before a hunk that would push it past the limit
function packRenderedHunks(
  renderedHunks: RenderedHunk[],
  maxChunkLines: number,
): RenderedHunk[][] {
  // the closed groups, the group being filled and its line count
  const hunkGroups: RenderedHunk[][] = []
  let openHunkGroup: RenderedHunk[] = []
  let openLineCount = 0

  // close the open group when the next hunk does not fit. an oversized hunk ends up alone
  for (const renderedHunk of renderedHunks) {
    const isOverLimit =
      openLineCount + renderedHunk.lines.length > maxChunkLines
    if (isOverLimit && openHunkGroup.length > 0) {
      hunkGroups.push(openHunkGroup)
      openHunkGroup = []
      openLineCount = 0
    }
    openHunkGroup.push(renderedHunk)
    openLineCount += renderedHunk.lines.length
  }

  // close the last group
  if (openHunkGroup.length > 0) {
    hunkGroups.push(openHunkGroup)
  }

  return hunkGroups
}

// one chunk to render: the file, its hunks in this chunk and the chunk position
interface CreatePacketChunkOptions {
  changedFile: ChangedFile
  hunkGroup: RenderedHunk[]
  chunkNumber: number
  chunkCount: number
}

// render one chunk's text from the file header lines and its hunks
function createPacketChunk({
  changedFile,
  hunkGroup,
  chunkNumber,
  chunkCount,
}: CreatePacketChunkOptions): PacketChunk {
  // name the file, its status, its previous path when renamed, and the chunk position
  const headerLines = [
    `file: ${changedFile.path}`,
    `status: ${changedFile.status}`,
  ]
  if (changedFile.previousPath !== undefined) {
    headerLines.push(`renamed from: ${changedFile.previousPath}`)
  }
  headerLines.push(`chunk: ${chunkNumber} of ${chunkCount}`)

  // follow the header with every hunk's header and lines
  const hunkTextLines = hunkGroup.flatMap((renderedHunk) => [
    renderedHunk.header,
    ...renderedHunk.lines,
  ])
  const text = [...headerLines, ...hunkTextLines].join('\n')

  // count the hunk lines without their headers
  let lineCount = 0
  for (const renderedHunk of hunkGroup) {
    lineCount += renderedHunk.lines.length
  }

  return { file: changedFile.path, chunkNumber, chunkCount, text, lineCount }
}

// hash the chunk texts joined by newline with sha256
function hashChunkTexts(chunks: PacketChunk[]): string {
  const hasher = new Bun.CryptoHasher('sha256')
  const chunkTexts = chunks.map((chunk) => chunk.text)
  hasher.update(chunkTexts.join('\n'))
  return hasher.digest('hex')
}
