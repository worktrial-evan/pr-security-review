// tests the review packet input validation: a setting out of range, an empty path, a path with a line break, a path named twice and a hunk line with a newline are rejected with an error naming them
import { describe, expect, test } from 'bun:test'
import type { ChangedFile, Hunk } from '@/shared/pull-request-source'
import {
  renamedChangedFile,
  sqlInjectionChangedFile,
  testContextLines,
} from './fixtures/changed-files'
import {
  type AssembleReviewPacketOptions,
  assembleReviewPacket,
  type ReviewPacket,
} from './review-packet'

// return a call that assembles the sql injection fixture with some options replaced
function assembleWithOptions(
  overrides: Partial<AssembleReviewPacketOptions>,
): () => ReviewPacket {
  return () =>
    assembleReviewPacket({
      changedFiles: [sqlInjectionChangedFile],
      contextLines: testContextLines,
      ...overrides,
    })
}

describe('assembleReviewPacket input validation', () => {
  test('throws for a negative contextLines, naming the setting', () => {
    expect(assembleWithOptions({ contextLines: -1 })).toThrow('contextLines')
  })

  test('throws for a fractional contextLines, naming the setting', () => {
    expect(assembleWithOptions({ contextLines: 1.5 })).toThrow('contextLines')
  })

  test('throws for a maxChunkLines of 0, naming the setting', () => {
    expect(assembleWithOptions({ maxChunkLines: 0 })).toThrow('maxChunkLines')
  })

  test('throws for a fractional maxChunkLines, naming the setting', () => {
    expect(assembleWithOptions({ maxChunkLines: 1.5 })).toThrow('maxChunkLines')
  })

  test('throws for a path with a newline, naming the path', () => {
    const newlinePathChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      path: 'src/users/find\n-user.ts',
    }

    expect(
      assembleWithOptions({ changedFiles: [newlinePathChangedFile] }),
    ).toThrow('src/users/find')
  })

  test('throws for a previous path with a newline, naming the previous path', () => {
    const newlinePreviousPathChangedFile: ChangedFile = {
      ...renamedChangedFile,
      previousPath: 'src/http/request\n-parser.ts',
    }

    expect(
      assembleWithOptions({ changedFiles: [newlinePreviousPathChangedFile] }),
    ).toThrow('src/http/request')
  })

  test('throws for an empty path', () => {
    const emptyPathChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      path: '',
    }

    expect(
      assembleWithOptions({ changedFiles: [emptyPathChangedFile] }),
    ).toThrow('empty path')
  })

  test('throws for a hunk line whose text holds a newline, naming the path and head line', () => {
    // the sql injection fixture with a newline inside its first added line
    const firstHunk = sqlInjectionChangedFile.hunks[0] as Hunk
    const newlineHunkLines = firstHunk.lines.map((hunkLine) =>
      hunkLine.headLine === 14
        ? { ...hunkLine, text: `${hunkLine.text}\n99 + injected()` }
        : hunkLine,
    )
    const newlineLineChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      hunks: [{ ...firstHunk, lines: newlineHunkLines }],
    }

    expect(
      assembleWithOptions({ changedFiles: [newlineLineChangedFile] }),
    ).toThrow('src/users/find-user.ts holds a newline inside hunk line 14')
  })

  test('throws for two changed files with the same path, naming the path', () => {
    expect(
      assembleWithOptions({
        changedFiles: [sqlInjectionChangedFile, { ...sqlInjectionChangedFile }],
      }),
    ).toThrow('src/users/find-user.ts')
  })
})
