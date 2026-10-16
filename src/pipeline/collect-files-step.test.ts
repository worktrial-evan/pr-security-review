// tests the file count limit and the byte limit. bytes are counted as utf-8
import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '@/shared/pull-request-source'
import { applyFileLimits, countHunkBytes } from './collect-files-step'

// a changed file with one hunk of the given added lines
function createChangedFile(path: string, lineTexts: string[]): ChangedFile {
  return {
    path,
    status: 'modified',
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: lineTexts.length,
        lines: lineTexts.map((text, index) => ({
          kind: 'added',
          headLine: index + 1,
          text,
        })),
      },
    ],
    addedLines: lineTexts.map((text, index) => ({ line: index + 1, text })),
    isBinary: false,
  }
}

describe('applyFileLimits', () => {
  test('withholds every file past the count limit', () => {
    const changedFiles = ['a.ts', 'b.ts', 'c.ts'].map((path) =>
      createChangedFile(path, ['x']),
    )
    const fileLimitSplit = applyFileLimits({
      changedFiles,
      limits: { maxChangedFiles: 2, maxFileBytes: 100 },
    })

    expect(
      fileLimitSplit.reviewedFiles.map((changedFile) => changedFile.path),
    ).toEqual(['a.ts', 'b.ts'])
    expect(fileLimitSplit.withheldFiles).toEqual([
      { path: 'c.ts', reason: 'over-max-changed-files' },
    ])
  })

  test('withholds a file whose hunk text is over the byte limit', () => {
    const changedFiles = [
      createChangedFile('small.ts', ['12345']),
      createChangedFile('large.ts', ['123456']),
    ]
    const fileLimitSplit = applyFileLimits({
      changedFiles,
      limits: { maxChangedFiles: 10, maxFileBytes: 5 },
    })

    expect(
      fileLimitSplit.reviewedFiles.map((changedFile) => changedFile.path),
    ).toEqual(['small.ts'])
    expect(fileLimitSplit.withheldFiles).toEqual([
      { path: 'large.ts', reason: 'over-max-file-bytes' },
    ])
  })
})

describe('countHunkBytes', () => {
  test('counts utf-8 bytes, not characters', () => {
    expect(countHunkBytes(createChangedFile('names.ts', ['é', 'ab']))).toBe(4)
  })
})
