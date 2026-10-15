// parses the unified diff text git prints into the ChangedFile values of the shared pull request contract
import type {
  AddedLine,
  ChangedFile,
  ChangedFileStatus,
  Hunk,
  HunkLine,
} from '@/shared/pull-request-source'

// the line every file section of a diff starts with
const fileHeaderPrefix = 'diff --git '

// the hunk header shape. the line counts default to 1 when git omits them
const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// what the extended header lines of one file section say about it
interface FileHeader {
  path: string
  status: ChangedFileStatus
  previousPath: string | undefined
  isBinary: boolean
}

// the two paths named on a diff --git line, with the a/ and b/ prefixes removed
interface FileHeaderPaths {
  oldPath: string
  newPath: string
}

// the numbers of a hunk header, before its lines are read
type HunkHeader = Omit<Hunk, 'lines'>

/**
 * Parses the output of git diff --unified=0 into one ChangedFile per file it names.
 */
export function parseUnifiedDiff(diffText: string): ChangedFile[] {
  // group the lines by file. every section starts at a diff --git header
  const fileSections = splitIntoFileSections(diffText)

  // turn each section into a changed file
  return fileSections.map(parseFileSection)
}

// cut the diff into one array of lines per file section
function splitIntoFileSections(diffText: string): string[][] {
  const fileSections: string[][] = []
  let currentFileSection: string[] | null = null

  // open a new section at every diff --git line and append every other line to the open one
  for (const line of diffText.split('\n')) {
    if (line.startsWith(fileHeaderPrefix)) {
      currentFileSection = [line]
      fileSections.push(currentFileSection)
      continue
    }
    if (currentFileSection === null) {
      continue
    }
    currentFileSection.push(line)
  }

  return fileSections
}

// read one file section into a changed file with its hunks and added lines
function parseFileSection(fileSectionLines: string[]): ChangedFile {
  // read the extended headers that come before the first hunk
  const fileHeader = parseFileHeader(fileSectionLines)

  // read the hunks. a binary file has none
  const hunks = fileHeader.isBinary ? [] : parseHunks(fileSectionLines)

  // list the added lines with their head line numbers
  const addedLines = collectAddedLines(hunks)

  // name the previous path only on a rename
  const changedFile: ChangedFile = {
    path: fileHeader.path,
    status: fileHeader.status,
    hunks,
    addedLines,
    isBinary: fileHeader.isBinary,
  }
  if (fileHeader.previousPath !== undefined) {
    changedFile.previousPath = fileHeader.previousPath
  }

  return changedFile
}

// what the header lines read so far say about a file: both paths, the status and the binary flag
interface FileHeaderState {
  oldPath: string
  newPath: string
  status: ChangedFileStatus
  isBinary: boolean
}

// read the status, the paths and the binary flag from the lines before the first hunk
function parseFileHeader(fileSectionLines: string[]): FileHeader {
  // start from the two paths on the diff --git line as a modified text file
  const [headerLine = '', ...extendedHeaderLines] = fileSectionLines
  const headerState: FileHeaderState = {
    ...parseFileHeaderPaths(headerLine),
    status: 'modified',
    isBinary: false,
  }

  // refine the state from each extended header line, stopping at the first hunk
  for (const line of extendedHeaderLines) {
    if (line.startsWith('@@ ')) {
      break
    }
    applyExtendedHeaderLine({ line, headerState })
  }

  // a rename keeps the old path as the previous path
  return {
    path: headerState.newPath,
    status: headerState.status,
    previousPath:
      headerState.status === 'renamed' ? headerState.oldPath : undefined,
    isBinary: headerState.isBinary,
  }
}

// one extended header line and the state it refines
interface ApplyExtendedHeaderLineOptions {
  line: string
  headerState: FileHeaderState
}

// update the header state from one extended header line: the mode lines set the status, the rename and path lines set the paths
function applyExtendedHeaderLine({
  line,
  headerState,
}: ApplyExtendedHeaderLineOptions): void {
  // the mode lines name an added or deleted file
  if (line.startsWith('new file mode')) {
    headerState.status = 'added'
    return
  }
  if (line.startsWith('deleted file mode')) {
    headerState.status = 'deleted'
    return
  }

  // the rename lines name both paths of a renamed file
  if (line.startsWith('rename from ')) {
    headerState.status = 'renamed'
    headerState.oldPath = line.slice('rename from '.length)
    return
  }
  if (line.startsWith('rename to ')) {
    headerState.status = 'renamed'
    headerState.newPath = line.slice('rename to '.length)
    return
  }

  // the --- and +++ lines name the paths, with /dev/null kept as the path already read
  if (line.startsWith('--- ')) {
    headerState.oldPath =
      stripDiffPrefix(line.slice('--- '.length)) ?? headerState.oldPath
    return
  }
  if (line.startsWith('+++ ')) {
    headerState.newPath =
      stripDiffPrefix(line.slice('+++ '.length)) ?? headerState.newPath
    return
  }

  // the binary line marks a file git prints no hunks for
  if (line.startsWith('Binary files ')) {
    headerState.isBinary = true
  }
}

// split the diff --git line into its two paths
function parseFileHeaderPaths(headerLine: string): FileHeaderPaths {
  // keep the text after the prefix, which holds both paths separated by a space
  const pathsText = headerLine.slice(fileHeaderPrefix.length)

  // prefer the split in the middle, which is exact when both sides name the same path
  const middleIndex = (pathsText.length - 1) / 2
  if (Number.isInteger(middleIndex) && pathsText[middleIndex] === ' ') {
    const leftPath = stripDiffPrefix(pathsText.slice(0, middleIndex))
    const rightPath = stripDiffPrefix(pathsText.slice(middleIndex + 1))
    if (leftPath !== null && leftPath === rightPath) {
      return { oldPath: leftPath, newPath: rightPath }
    }
  }

  // fall back to the first b/ boundary when the two paths differ
  const boundaryIndex = pathsText.indexOf(' b/')
  if (boundaryIndex === -1) {
    return { oldPath: pathsText, newPath: pathsText }
  }
  const oldPath =
    stripDiffPrefix(pathsText.slice(0, boundaryIndex)) ?? pathsText
  const newPath =
    stripDiffPrefix(pathsText.slice(boundaryIndex + 1)) ?? pathsText
  return { oldPath, newPath }
}

// remove the a/ or b/ prefix git puts before a path. null stands for /dev/null
function stripDiffPrefix(rawPath: string): string | null {
  // git appends a tab after a path that holds spaces
  const [pathText = ''] = rawPath.split('\t')
  if (pathText === '/dev/null') {
    return null
  }
  if (pathText.startsWith('a/') || pathText.startsWith('b/')) {
    return pathText.slice(2)
  }
  return pathText
}

// read every hunk of a file section with its lines numbered on the head side
function parseHunks(fileSectionLines: string[]): Hunk[] {
  const hunks: Hunk[] = []
  let currentHunk: Hunk | null = null
  let headCursor = 0

  // open a hunk at every hunk header and number the lines that follow it
  for (const line of fileSectionLines) {
    const hunkHeader = parseHunkHeader(line)
    if (hunkHeader !== null) {
      currentHunk = { ...hunkHeader, lines: [] }
      hunks.push(currentHunk)
      headCursor = startHeadCursor(hunkHeader)
      continue
    }
    if (currentHunk === null) {
      continue
    }
    const hunkLine = parseHunkLine({ line, headCursor })
    if (hunkLine === null) {
      continue
    }
    currentHunk.lines.push(hunkLine)
    if (hunkLine.kind !== 'removed') {
      headCursor += 1
    }
  }

  return hunks
}

// read the four numbers of a hunk header. null when the line is not one
function parseHunkHeader(line: string): HunkHeader | null {
  const hunkHeaderMatch = hunkHeaderPattern.exec(line)
  if (hunkHeaderMatch === null) {
    return null
  }
  const [, oldStart = '0', oldLines = '1', newStart = '0', newLines = '1'] =
    hunkHeaderMatch
  return {
    oldStart: Number(oldStart),
    oldLines: Number(oldLines),
    newStart: Number(newStart),
    newLines: Number(newLines),
  }
}

// the head line the first line of a hunk sits at. a hunk that only removes
// lines names the line before the removal, so the removal sits one line later
function startHeadCursor(hunkHeader: HunkHeader): number {
  if (hunkHeader.newLines === 0) {
    return hunkHeader.newStart + 1
  }
  return hunkHeader.newStart
}

// the line and the head cursor it is read at
interface ParseHunkLineOptions {
  line: string
  headCursor: number
}

// read one hunk line by its marker. null for the no newline marker and anything else
function parseHunkLine({
  line,
  headCursor,
}: ParseHunkLineOptions): HunkLine | null {
  const marker = line[0]
  const text = line.slice(1)
  if (marker === '+') {
    return { kind: 'added', headLine: headCursor, text }
  }
  if (marker === '-') {
    return { kind: 'removed', headLine: headCursor, text }
  }
  if (marker === ' ') {
    return { kind: 'context', headLine: headCursor, text }
  }
  return null
}

// list the added lines of every hunk with their head line numbers
function collectAddedLines(hunks: Hunk[]): AddedLine[] {
  const addedLines: AddedLine[] = []
  for (const hunk of hunks) {
    for (const hunkLine of hunk.lines) {
      if (hunkLine.kind !== 'added') {
        continue
      }
      addedLines.push({ line: hunkLine.headLine, text: hunkLine.text })
    }
  }
  return addedLines
}
