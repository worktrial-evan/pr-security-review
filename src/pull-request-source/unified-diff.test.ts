// tests parsing git unified diff text into hunks and collecting added lines
import { describe, expect, test } from 'bun:test'
import { collectAddedLines, parseUnifiedDiffHunks } from './unified-diff'

// a two-hunk diff whose first hunk removes a line that looks like a file header
const twoHunkDiff = [
  'diff --git a/notes.txt b/notes.txt',
  'index 1111111..2222222 100644',
  '--- a/notes.txt',
  '+++ b/notes.txt',
  '@@ -1,3 +1,3 @@',
  ' alpha',
  '--- not a header',
  '+beta',
  ' gamma',
  '@@ -20 +20,2 @@',
  ' twenty',
  '+twenty one',
  '\\ No newline at end of file',
  '',
].join('\n')

// a new file diff with an empty old side
const newFileDiff = [
  'diff --git a/new.txt b/new.txt',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/new.txt',
  '@@ -0,0 +1,2 @@',
  '+first',
  '+second',
  '',
].join('\n')

describe('parseUnifiedDiffHunks', () => {
  test('parses two hunks, reading a removed header-like line by count', () => {
    const hunks = parseUnifiedDiffHunks(twoHunkDiff)

    expect(hunks).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'context', headLine: 1, text: 'alpha' },
          { kind: 'removed', headLine: 0, text: '-- not a header' },
          { kind: 'added', headLine: 2, text: 'beta' },
          { kind: 'context', headLine: 3, text: 'gamma' },
        ],
      },
      {
        oldStart: 20,
        oldLines: 1,
        newStart: 20,
        newLines: 2,
        lines: [
          { kind: 'context', headLine: 20, text: 'twenty' },
          { kind: 'added', headLine: 21, text: 'twenty one' },
        ],
      },
    ])
  })

  test('parses an empty old side header', () => {
    const hunks = parseUnifiedDiffHunks(newFileDiff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.oldStart).toBe(0)
    expect(hunks[0]?.oldLines).toBe(0)
    expect(hunks[0]?.lines.map((hunkLine) => hunkLine.headLine)).toEqual([1, 2])
  })

  test('returns no hunks for an empty diff', () => {
    expect(parseUnifiedDiffHunks('')).toEqual([])
  })
})

describe('collectAddedLines', () => {
  test('collects every added line with its head line number in order', () => {
    const hunks = parseUnifiedDiffHunks(twoHunkDiff)
    expect(collectAddedLines(hunks)).toEqual([
      { line: 2, text: 'beta' },
      { line: 21, text: 'twenty one' },
    ])
  })
})
