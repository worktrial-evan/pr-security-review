// tests the changed file fixtures: every one parses through the shared schema and lists exactly its added hunk lines, the named list holds the eight fixtures in order, and the large file builder numbers its hunks with a gap of ten
import { describe, expect, test } from 'bun:test'
import {
  type ChangedFile,
  changedFileSchema,
} from '@/shared/pull-request-source'
import {
  buildLargeChangedFile,
  namedChangedFiles,
  toAddedLines,
} from './changed-files'

// the named fixtures and one built large file
const checkedChangedFiles: ChangedFile[] = [
  ...namedChangedFiles,
  buildLargeChangedFile({ hunkCount: 2, linesPerHunk: 3 }),
]

describe('changed file fixtures', () => {
  test('every named fixture and a built large file parse through changedFileSchema', () => {
    for (const changedFile of checkedChangedFiles) {
      expect(changedFileSchema.parse(changedFile)).toEqual(changedFile)
    }
  })

  test('every fixture lists exactly its added hunk lines as added lines', () => {
    for (const changedFile of checkedChangedFiles) {
      // collect the added lines of every hunk in order
      const hunkLines = changedFile.hunks.flatMap((hunk) => hunk.lines)
      const expectedAddedLines = toAddedLines(hunkLines)

      expect(changedFile.addedLines).toEqual(expectedAddedLines)
    }
  })

  test('names the eight fixtures in declaration order', () => {
    expect(namedChangedFiles.map((changedFile) => changedFile.path)).toEqual([
      'src/users/find-user.ts',
      'src/config/load-settings.ts',
      'src/http/parse-request.ts',
      'assets/logo.png',
      'src/legacy/old-handler.ts',
      'bun.lock',
      'dist/app.min.js',
      'src/metrics/report-usage.ts',
    ])
  })

  test('builds a large file with consecutive head lines and a gap of ten between hunks', () => {
    const largeChangedFile = buildLargeChangedFile({
      hunkCount: 3,
      linesPerHunk: 4,
    })

    const hunkHeadLines = largeChangedFile.hunks.map((hunk) =>
      hunk.lines.map((hunkLine) => hunkLine.headLine),
    )

    expect(hunkHeadLines).toEqual([
      [1, 2, 3, 4],
      [15, 16, 17, 18],
      [29, 30, 31, 32],
    ])
    expect(largeChangedFile.addedLines).toHaveLength(12)
  })
})
