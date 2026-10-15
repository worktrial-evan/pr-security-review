// diffs two texts line by line with a longest common subsequence and builds git-style hunks
import type { Hunk, HunkLineKind } from '@/shared/pull-request-source'

export interface BuildLineDiffHunksOptions {
  baseText: string
  headText: string
  contextLines: number
}

// one line of a text. key holds the terminator so a missing final newline differs
interface TextLine {
  key: string
  text: string
}

// one step of the edit script, with the base and head line counts before it
interface EditStep {
  kind: HunkLineKind
  text: string
  baseLinesBefore: number
  headLinesBefore: number
}

/**
 * Builds the unified diff hunks between two texts with git's hunk boundaries and header numbers.
 */
export function buildLineDiffHunks({
  baseText,
  headText,
  contextLines,
}: BuildLineDiffHunksOptions): Hunk[] {
  // diff the two line lists into a numbered edit script
  const baseLines = splitTextLines(baseText)
  const headLines = splitTextLines(headText)
  const editSteps = walkEditScript(baseLines, headLines)

  // cut a hunk around each group of nearby changes
  const changeGroups = groupChanges(editSteps, contextLines)
  return changeGroups.map(([firstIndex, lastIndex]) => {
    const startIndex = Math.max(0, firstIndex - contextLines)
    const endIndex = lastIndex + contextLines + 1
    return toHunk(editSteps.slice(startIndex, endIndex))
  })
}

// split a text into lines, keeping each terminator in the key
function splitTextLines(text: string): TextLine[] {
  const parts = text === '' ? [] : text.split('\n')
  const isNewlineTerminated = parts.at(-1) === ''
  if (isNewlineTerminated) {
    parts.pop()
  }
  return parts.map((part, i) => {
    const hasTerminator = i < parts.length - 1 || isNewlineTerminated
    return { key: hasTerminator ? `${part}\n` : part, text: part }
  })
}

// walk the common subsequence table from the start, preferring removal on a tie.
// once a run adds a line, removal is never optimal again before the next match, so removed lines lead each run
function walkEditScript(
  baseLines: TextLine[],
  headLines: TextLine[],
): EditStep[] {
  // fill the common subsequence length of every pair of suffixes
  const columnCount = headLines.length + 1
  const suffixLengths = new Uint32Array((baseLines.length + 1) * columnCount)
  const lengthAt = (baseIndex: number, headIndex: number): number =>
    suffixLengths[baseIndex * columnCount + headIndex] ?? 0
  for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let headIndex = headLines.length - 1; headIndex >= 0; headIndex -= 1) {
      const isMatch = baseLines[baseIndex]?.key === headLines[headIndex]?.key
      suffixLengths[baseIndex * columnCount + headIndex] = isMatch
        ? lengthAt(baseIndex + 1, headIndex + 1) + 1
        : Math.max(
            lengthAt(baseIndex + 1, headIndex),
            lengthAt(baseIndex, headIndex + 1),
          )
    }
  }

  // emit a context, removed or added step at each position, numbered by the lines before it
  const editSteps: EditStep[] = []
  let baseIndex = 0
  let headIndex = 0
  while (baseIndex < baseLines.length || headIndex < headLines.length) {
    const baseLine = baseLines[baseIndex]
    const headLine = headLines[headIndex]
    const isRemoval =
      headLine === undefined ||
      (baseLine !== undefined &&
        lengthAt(baseIndex + 1, headIndex) >=
          lengthAt(baseIndex, headIndex + 1))
    const kind: HunkLineKind =
      baseLine?.key === headLine?.key
        ? 'context'
        : isRemoval
          ? 'removed'
          : 'added'
    const text = (kind === 'removed' ? baseLine?.text : headLine?.text) ?? ''
    editSteps.push({
      kind,
      text,
      baseLinesBefore: baseIndex,
      headLinesBefore: headIndex,
    })
    baseIndex += kind === 'added' ? 0 : 1
    headIndex += kind === 'removed' ? 0 : 1
  }
  return editSteps
}

// group change indexes into first and last pairs. git merges changes at most twice the context apart
function groupChanges(
  editSteps: EditStep[],
  contextLines: number,
): [number, number][] {
  const changeGroups: [number, number][] = []
  for (const [i, editStep] of editSteps.entries()) {
    const lastGroup = changeGroups.at(-1)
    const isChange = editStep.kind !== 'context'
    if (isChange && lastGroup && i - lastGroup[1] - 1 <= 2 * contextLines) {
      lastGroup[1] = i
    } else if (isChange) {
      changeGroups.push([i, i])
    }
  }
  return changeGroups
}

// shape a slice of steps into a hunk. an empty side starts at the line before it, as in git
function toHunk(hunkSteps: EditStep[]): Hunk {
  const firstStep = hunkSteps[0]
  const countLines = (excludedKind: HunkLineKind): number =>
    hunkSteps.filter((editStep) => editStep.kind !== excludedKind).length
  const oldLines = countLines('added')
  const newLines = countLines('removed')
  return {
    oldStart: (firstStep?.baseLinesBefore ?? 0) + Math.min(oldLines, 1),
    oldLines,
    newStart: (firstStep?.headLinesBefore ?? 0) + Math.min(newLines, 1),
    newLines,
    lines: hunkSteps.map((editStep) => ({
      kind: editStep.kind,
      headLine: editStep.kind === 'removed' ? 0 : editStep.headLinesBefore + 1,
      text: editStep.text,
    })),
  }
}
