// parses git's unified diff text into hunks and collects the added lines from hunks
import type { AddedLine, Hunk, HunkLine } from '@/shared/pull-request-source'

// a hunk header: @@ -oldStart,oldLines +newStart,newLines @@. a count of 1 may be left out
const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parses the unified diff text of one file into hunks, with head line numbers on every line and 0 on removed lines.
 */
export function parseUnifiedDiffHunks(diffText: string): Hunk[] {
  const hunks: Hunk[] = []
  const diffLines = diffText.split('\n')
  let lineIndex = 0

  // read each hunk header and the body lines its counts promise
  while (lineIndex < diffLines.length) {
    const headerMatch = hunkHeaderPattern.exec(diffLines[lineIndex] ?? '')
    lineIndex += 1
    if (headerMatch === null) {
      continue
    }
    const hunk = createHunk(headerMatch)
    lineIndex = readHunkBody({ hunk, diffLines, startIndex: lineIndex })
    hunks.push(hunk)
  }

  return hunks
}

/**
 * Collects the head line number and text of every added line in the hunks, in head line order.
 */
export function collectAddedLines(hunks: Hunk[]): AddedLine[] {
  const hunkLines = hunks.flatMap((hunk) => hunk.lines)
  const addedHunkLines = hunkLines.filter(
    (hunkLine) => hunkLine.kind === 'added',
  )
  return addedHunkLines.map((hunkLine) => ({
    line: hunkLine.headLine,
    text: hunkLine.text,
  }))
}

// build an empty hunk from a matched header
function createHunk(headerMatch: RegExpExecArray): Hunk {
  const [, oldStart = '0', oldLines = '1', newStart = '0', newLines = '1'] =
    headerMatch
  return {
    oldStart: Number(oldStart),
    oldLines: Number(oldLines),
    newStart: Number(newStart),
    newLines: Number(newLines),
    lines: [],
  }
}

interface ReadHunkBodyOptions {
  hunk: Hunk
  diffLines: string[]
  startIndex: number
}

// append body lines to the hunk until its old and new counts are used up, and return the next index
function readHunkBody({
  hunk,
  diffLines,
  startIndex,
}: ReadHunkBodyOptions): number {
  let remainingOldLines = hunk.oldLines
  let remainingNewLines = hunk.newLines
  let headLine = hunk.newStart
  let lineIndex = startIndex

  // consume lines until both counts are used up
  while (remainingOldLines > 0 || remainingNewLines > 0) {
    const diffLine = diffLines[lineIndex]
    if (diffLine === undefined) {
      break
    }
    lineIndex += 1

    // turn the line into a hunk line, skipping a no-newline marker
    const hunkLine = toHunkLine(diffLine, headLine)
    if (hunkLine === null) {
      continue
    }
    hunk.lines.push(hunkLine)

    // use up the counts of the sides the line belongs to
    if (hunkLine.kind !== 'added') {
      remainingOldLines -= 1
    }
    if (hunkLine.kind !== 'removed') {
      remainingNewLines -= 1
      headLine += 1
    }
  }

  // skip a no-newline marker after the last counted line
  if (diffLines[lineIndex]?.startsWith('\\')) {
    lineIndex += 1
  }
  return lineIndex
}

// turn one prefixed diff line into a hunk line, or null for anything else
function toHunkLine(diffLine: string, headLine: number): HunkLine | null {
  const prefix = diffLine[0]
  const text = diffLine.slice(1)
  if (prefix === ' ') {
    return { kind: 'context', headLine, text }
  }
  if (prefix === '-') {
    return { kind: 'removed', headLine: 0, text }
  }
  if (prefix === '+') {
    return { kind: 'added', headLine, text }
  }
  return null
}
