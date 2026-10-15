// tests the line diff hunks against hand-checked cases and against git's own diff of the same texts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'
import type { Hunk } from '@/shared/pull-request-source'
import { buildLineDiffHunks } from './line-diff'
import { parseUnifiedDiffHunks } from './unified-diff'

// a temporary directory for the texts git compares
let textsDirectory = ''

beforeAll(async () => {
  textsDirectory = await mkdtemp(join(tmpdir(), 'line-diff-'))
})

afterAll(async () => {
  await rm(textsDirectory, { recursive: true, force: true })
})

describe('buildLineDiffHunks', () => {
  test('wraps one modified line in three lines of context', () => {
    // change line 5 of a ten-line file
    const baseText = numberedLines(1, 10)
    const headText = baseText.replace('line 5\n', 'line five\n')

    const hunks = buildLineDiffHunks({ baseText, headText, contextLines: 3 })

    expect(hunks).toEqual([
      {
        oldStart: 2,
        oldLines: 7,
        newStart: 2,
        newLines: 7,
        lines: [
          { kind: 'context', headLine: 2, text: 'line 2' },
          { kind: 'context', headLine: 3, text: 'line 3' },
          { kind: 'context', headLine: 4, text: 'line 4' },
          { kind: 'removed', headLine: 0, text: 'line 5' },
          { kind: 'added', headLine: 5, text: 'line five' },
          { kind: 'context', headLine: 6, text: 'line 6' },
          { kind: 'context', headLine: 7, text: 'line 7' },
          { kind: 'context', headLine: 8, text: 'line 8' },
        ],
      },
    ])
  })

  test('merges changes twice the context apart and splits changes further apart', () => {
    // change lines 2 and 9, six unchanged lines apart, then lines 2 and 10, seven apart
    const baseText = numberedLines(1, 14)
    const mergedHeadText = baseText
      .replace('line 2\n', 'two\n')
      .replace('line 9\n', 'nine\n')
    const splitHeadText = baseText
      .replace('line 2\n', 'two\n')
      .replace('line 10\n', 'ten\n')

    const mergedHunks = buildLineDiffHunks({
      baseText,
      headText: mergedHeadText,
      contextLines: 3,
    })
    const splitHunks = buildLineDiffHunks({
      baseText,
      headText: splitHeadText,
      contextLines: 3,
    })

    expect(mergedHunks).toHaveLength(1)
    expect(splitHunks).toHaveLength(2)
  })

  test('starts the empty side of a new file at line 0', () => {
    const hunks = buildLineDiffHunks({
      baseText: '',
      headText: 'a\nb\n',
      contextLines: 3,
    })
    expect(hunks.map(toHeader)).toEqual(['-0,0 +1,2'])
    expect(hunks[0]?.lines.map((hunkLine) => hunkLine.headLine)).toEqual([1, 2])
  })

  test('treats a missing final newline as a changed line', () => {
    const hunks = buildLineDiffHunks({
      baseText: 'a\nb',
      headText: 'a\nb\n',
      contextLines: 3,
    })
    const hunkLineKinds = hunks[0]?.lines.map((hunkLine) => hunkLine.kind)
    expect(hunkLineKinds).toEqual(['context', 'removed', 'added'])
  })

  test('returns no hunks for identical texts', () => {
    const baseText = numberedLines(1, 5)
    expect(
      buildLineDiffHunks({ baseText, headText: baseText, contextLines: 3 }),
    ).toEqual([])
  })

  test.each([
    ['a deleted file', numberedLines(1, 4), '', 3],
    [
      'an insertion with no context',
      numberedLines(1, 8),
      `${numberedLines(1, 5)}new\n${numberedLines(6, 8)}`,
      0,
    ],
    [
      'a deletion with no context',
      numberedLines(1, 8),
      numberedLines(1, 5) + numberedLines(8, 8),
      0,
    ],
    [
      'a removal and an addition in one run',
      numberedLines(1, 9),
      `line 1\nx\ny\nz\n${numberedLines(5, 9)}`,
      2,
    ],
    [
      'changes at both ends',
      numberedLines(1, 20),
      `start\n${numberedLines(2, 19)}end`,
      3,
    ],
  ])(
    'matches git diff for %s',
    async (_caseName, baseText, headText, contextLines) => {
      const gitHunks = await diffWithGit({ baseText, headText, contextLines })
      expect(buildLineDiffHunks({ baseText, headText, contextLines })).toEqual(
        gitHunks,
      )
    },
  )
})

// build "line n" lines from first to last, each with a newline
function numberedLines(first: number, last: number): string {
  const lineNumbers = Array.from(
    { length: last - first + 1 },
    (_, i) => first + i,
  )
  return lineNumbers.map((lineNumber) => `line ${lineNumber}\n`).join('')
}

// write a hunk header the way git prints it, without the @@ marks
function toHeader(hunk: Hunk): string {
  return `-${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}`
}

interface DiffWithGitOptions {
  baseText: string
  headText: string
  contextLines: number
}

// diff two texts with git and parse its hunks
async function diffWithGit({
  baseText,
  headText,
  contextLines,
}: DiffWithGitOptions): Promise<Hunk[]> {
  const basePath = join(textsDirectory, 'base.txt')
  const headPath = join(textsDirectory, 'head.txt')
  await Bun.write(basePath, baseText)
  await Bun.write(headPath, headText)
  const gitDiff =
    await $`git diff --no-index --no-color --no-ext-diff --diff-algorithm=myers --minimal --unified=${contextLines} ${basePath} ${headPath}`
      .nothrow()
      .quiet()
      .text()
  return parseUnifiedDiffHunks(gitDiff)
}
