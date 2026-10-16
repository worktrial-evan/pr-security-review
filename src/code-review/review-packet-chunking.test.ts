// tests the review packet chunking: eight hunks of 100 lines split into two chunks at the default limit, an oversized hunk alone, an empty hunk given no chunk of its own, and a custom limit
import { describe, expect, test } from 'bun:test'
import type { ChangedFile, Hunk } from '@/shared/pull-request-source'
import {
  buildLargeChangedFile,
  testContextLines,
} from './fixtures/changed-files'
import { assembleReviewPacket, defaultMaxChunkLines } from './review-packet'

describe('assembleReviewPacket chunking', () => {
  test('splits eight hunks of 100 lines into two chunks on hunk boundaries at the default limit', () => {
    const largeChangedFile = buildLargeChangedFile({
      hunkCount: 8,
      linesPerHunk: 100,
    })

    const packet = assembleReviewPacket({
      changedFiles: [largeChangedFile],
      contextLines: testContextLines,
    })

    expect(packet.chunks).toHaveLength(2)
    expect(packet.chunks.map((chunk) => chunk.chunkNumber)).toEqual([1, 2])
    expect(packet.chunks.map((chunk) => chunk.chunkCount)).toEqual([2, 2])
    expect(packet.chunks[0]?.text).toContain('chunk: 1 of 2')
    expect(packet.chunks[1]?.text).toContain('chunk: 2 of 2')

    // no hunk is split, and no chunk passes the limit
    const lineCounts = packet.chunks.map((chunk) => chunk.lineCount)
    expect(
      lineCounts.reduce(
        (lineCountTotal, lineCount) => lineCountTotal + lineCount,
        0,
      ),
    ).toBe(800)
    for (const lineCount of lineCounts) {
      expect(lineCount % 100).toBe(0)
      expect(lineCount).toBeLessThanOrEqual(defaultMaxChunkLines)
    }

    // every chunk starts with the same file header
    for (const chunk of packet.chunks) {
      expect(chunk.file).toBe('src/api/routes.ts')
      expect(chunk.text).toStartWith(
        'file: src/api/routes.ts\nstatus: modified\n',
      )
    }
  })

  test('puts a hunk larger than the limit in a chunk of its own', () => {
    const oversizedChangedFile = buildLargeChangedFile({
      hunkCount: 2,
      linesPerHunk: 600,
    })

    const packet = assembleReviewPacket({
      changedFiles: [oversizedChangedFile],
      contextLines: testContextLines,
    })

    expect(packet.chunks.map((chunk) => chunk.lineCount)).toEqual([600, 600])
    expect(packet.chunks.map((chunk) => chunk.chunkNumber)).toEqual([1, 2])
    expect(packet.chunks.map((chunk) => chunk.chunkCount)).toEqual([2, 2])
  })

  test('gives an empty hunk before an oversized hunk no chunk of its own', () => {
    // a file whose first hunk holds no lines and whose second hunk passes the limit
    const oversizedChangedFile = buildLargeChangedFile({
      hunkCount: 1,
      linesPerHunk: 600,
    })
    const emptyHunk: Hunk = {
      oldStart: 0,
      oldLines: 0,
      newStart: 0,
      newLines: 0,
      lines: [],
    }
    const emptyHunkChangedFile: ChangedFile = {
      ...oversizedChangedFile,
      hunks: [emptyHunk, ...oversizedChangedFile.hunks],
    }

    const packet = assembleReviewPacket({
      changedFiles: [emptyHunkChangedFile],
      contextLines: testContextLines,
    })

    expect(packet.chunks.map((chunk) => chunk.lineCount)).toEqual([600])
    expect(packet.chunks[0]?.text).not.toContain('@@ +0,0 @@')
  })

  test('fills chunks up to a custom limit', () => {
    const smallChangedFile = buildLargeChangedFile({
      hunkCount: 3,
      linesPerHunk: 10,
    })

    const packet = assembleReviewPacket({
      changedFiles: [smallChangedFile],
      contextLines: testContextLines,
      maxChunkLines: 20,
    })

    expect(packet.chunks.map((chunk) => chunk.lineCount)).toEqual([20, 10])
  })
})
