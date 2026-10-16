// tests the review packet: the snapshot, path order, skipped files, the context cap, line rendering and the hash
import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '@/shared/pull-request-source'
import {
  namedChangedFiles,
  removedOnlyChangedFile,
  renamedChangedFile,
  sqlInjectionChangedFile,
  testContextLines,
  wideContextChangedFile,
} from './fixtures/changed-files'
import {
  assembleReviewPacket,
  type PacketChunk,
  type ReviewPacket,
  renderedHunkLinePattern,
} from './review-packet'

// assemble the packet over the named fixtures
function assembleNamedPacket(): ReviewPacket {
  return assembleReviewPacket({
    changedFiles: namedChangedFiles,
    contextLines: testContextLines,
  })
}

// return the one chunk of a file in a packet
function findChunk(packet: ReviewPacket, file: string): PacketChunk {
  const fileChunks = packet.chunks.filter((chunk) => chunk.file === file)
  expect(fileChunks).toHaveLength(1)
  const fileChunk = fileChunks[0]
  if (fileChunk === undefined) {
    throw new Error(`no chunk for ${file}`)
  }
  return fileChunk
}

// return the rendered hunk lines of a chunk: everything after the chunk header line, without the hunk headers
function readHunkLines(chunk: PacketChunk): string[] {
  const textLines = chunk.text.split('\n')
  const chunkHeaderIndex = textLines.findIndex((textLine) =>
    textLine.startsWith('chunk: '),
  )
  const hunkTextLines = textLines.slice(chunkHeaderIndex + 1)
  return hunkTextLines.filter((hunkTextLine) => !hunkTextLine.startsWith('@@ '))
}

// return the sql injection fixture with the table in its query line renamed, in the hunk and in the added lines
function renameQueryTable(): ChangedFile {
  const renameTable = (text: string): string =>
    text.replace('FROM users', 'FROM accounts')
  return {
    ...sqlInjectionChangedFile,
    hunks: sqlInjectionChangedFile.hunks.map((hunk) => ({
      ...hunk,
      lines: hunk.lines.map((hunkLine) => ({
        ...hunkLine,
        text: renameTable(hunkLine.text),
      })),
    })),
    addedLines: sqlInjectionChangedFile.addedLines.map((addedLine) => ({
      ...addedLine,
      text: renameTable(addedLine.text),
    })),
  }
}

describe('assembleReviewPacket', () => {
  test('matches the snapshot over the named fixtures at 30 context lines', () => {
    const packet = assembleNamedPacket()

    expect(packet).toMatchSnapshot()
  })

  test('gives the same packet on two runs', () => {
    expect(assembleNamedPacket()).toEqual(assembleNamedPacket())
  })

  test('orders chunks by path as byte strings and leaves the input untouched', () => {
    // add an uppercase path. byte order puts it before every lowercase one
    const upperCaseChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      path: 'src/Zeta.ts',
    }
    const lowerCaseChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      path: 'src/alpha.ts',
    }
    const changedFiles = [
      lowerCaseChangedFile,
      ...namedChangedFiles,
      upperCaseChangedFile,
    ].reverse()
    const inputPaths = changedFiles.map((changedFile) => changedFile.path)

    const packet = assembleReviewPacket({
      changedFiles,
      contextLines: testContextLines,
    })

    expect(packet.chunks.map((chunk) => chunk.file)).toEqual([
      'src/Zeta.ts',
      'src/alpha.ts',
      'src/config/load-settings.ts',
      'src/http/parse-request.ts',
      'src/users/find-user.ts',
    ])
    expect(changedFiles.map((changedFile) => changedFile.path)).toEqual(
      inputPaths,
    )
  })

  test('records every skipped fixture with its reason, in path order, and gives it no chunk', () => {
    const packet = assembleNamedPacket()

    expect(packet.skippedFiles).toEqual([
      { file: 'assets/logo.png', reason: 'binary' },
      { file: 'bun.lock', reason: 'lockfile' },
      { file: 'dist/app.min.js', reason: 'generated' },
      { file: 'src/legacy/old-handler.ts', reason: 'deleted' },
      { file: 'src/metrics/report-usage.ts', reason: 'no-added-lines' },
    ])

    // no chunk names a skipped file
    const chunkFiles = packet.chunks.map((chunk) => chunk.file)
    for (const skippedFile of packet.skippedFiles) {
      expect(chunkFiles).not.toContain(skippedFile.file)
    }
  })

  test('starts each chunk with the file, its status, the previous path of a renamed file and the chunk position', () => {
    const packet = assembleNamedPacket()

    // the renamed file names its previous path between the status and the chunk position
    const renamedChunk = findChunk(packet, renamedChangedFile.path)
    expect(renamedChunk.text.split('\n').slice(0, 4)).toEqual([
      'file: src/http/parse-request.ts',
      'status: renamed',
      'renamed from: src/http/request-parser.ts',
      'chunk: 1 of 1',
    ])

    // the modified file goes from the status straight to the chunk position
    const sqlInjectionChunk = findChunk(packet, sqlInjectionChangedFile.path)
    expect(sqlInjectionChunk.text.split('\n').slice(0, 3)).toEqual([
      'file: src/users/find-user.ts',
      'status: modified',
      'chunk: 1 of 1',
    ])
  })

  test('renders the sql injection hunk as its header and one numbered line per hunk line', () => {
    const packet = assembleNamedPacket()

    const sqlInjectionChunk = findChunk(packet, sqlInjectionChangedFile.path)

    expect(sqlInjectionChunk.text).toBe(
      [
        'file: src/users/find-user.ts',
        'status: modified',
        'chunk: 1 of 1',
        '@@ +12,7 @@',
        '12   export async function findUser(request: HttpRequest): Promise<HttpResponse> {',
        '13     const database = await connectDatabase()',
        '14 +   const userId = request.query.id',
        '15 +   const rows = await database.query("SELECT * FROM users WHERE id = " + userId)',
        '16     if (rows.length === 0) {',
        '17       return notFound()',
        '18     }',
      ].join('\n'),
    )
    expect(sqlInjectionChunk.lineCount).toBe(7)
  })
})

describe('assembleReviewPacket context cap', () => {
  test('keeps 30 context lines on each side of the wide context change, head lines 11 through 71', () => {
    const packet = assembleNamedPacket()

    // split the rendered hunk lines into the context before the change, the added line and the context after it
    const wideContextChunk = findChunk(packet, wideContextChangedFile.path)
    const hunkLines = readHunkLines(wideContextChunk)
    const contextLinesBefore = hunkLines.slice(0, 30)
    const addedLine = hunkLines[30]
    const contextLinesAfter = hunkLines.slice(31)

    expect(hunkLines).toHaveLength(61)
    expect(contextLinesBefore.map((hunkLine) => hunkLine.slice(0, 5))).toEqual(
      contextLinesBefore.map((_hunkLine, index) => `${11 + index}   `),
    )
    expect(addedLine).toStartWith('41 + ')
    expect(contextLinesAfter).toHaveLength(30)
    expect(contextLinesAfter.map((hunkLine) => hunkLine.slice(0, 5))).toEqual(
      contextLinesAfter.map((_hunkLine, index) => `${42 + index}   `),
    )
    expect(wideContextChunk.text).toContain('@@ +11,61 @@')
    expect(wideContextChunk.lineCount).toBe(61)
  })

  test('counts the header from the first shown line after the cap', () => {
    const packet = assembleReviewPacket({
      changedFiles: [sqlInjectionChangedFile],
      contextLines: 1,
    })

    const sqlInjectionChunk = findChunk(packet, sqlInjectionChangedFile.path)

    expect(sqlInjectionChunk.text).toContain('@@ +13,4 @@')
    expect(
      readHunkLines(sqlInjectionChunk).map((hunkLine) => hunkLine.slice(0, 2)),
    ).toEqual(['13', '14', '15', '16'])
  })

  test('leaves a hunk with no change whole and gives it a header from its first line', () => {
    // a file whose second hunk holds only context lines
    const contextOnlyHunkChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      hunks: [
        ...sqlInjectionChangedFile.hunks,
        {
          oldStart: 30,
          oldLines: 3,
          newStart: 32,
          newLines: 3,
          lines: [
            {
              kind: 'context',
              headLine: 32,
              text: 'export function notFound(): HttpResponse {',
            },
            { kind: 'context', headLine: 33, text: '  return { status: 404 }' },
            { kind: 'context', headLine: 34, text: '}' },
          ],
        },
      ],
    }

    const packet = assembleReviewPacket({
      changedFiles: [contextOnlyHunkChangedFile],
      contextLines: 0,
    })

    // the changed hunk is cut to its two added lines and the context-only hunk keeps all three
    const chunk = findChunk(packet, sqlInjectionChangedFile.path)
    expect(chunk.text).toContain('@@ +14,2 @@')
    expect(chunk.text).toContain('@@ +32,3 @@')
    expect(chunk.lineCount).toBe(5)
  })
})

describe('assembleReviewPacket line rendering', () => {
  test('renders every hunk line as the head line, the marker and the text', () => {
    const packet = assembleNamedPacket()

    for (const chunk of packet.chunks) {
      for (const hunkLine of readHunkLines(chunk)) {
        expect(hunkLine).toMatch(renderedHunkLinePattern)
      }
    }
  })

  test('shows 0 on a removed line and the head line on added and context lines', () => {
    const packet = assembleNamedPacket()

    const renamedChunk = findChunk(packet, renamedChangedFile.path)

    expect(readHunkLines(renamedChunk)).toEqual([
      '4   export function parseRequest(rawRequest: string): ParsedRequest {',
      '0 -   const headerText = rawRequest.split("\\r\\n\\r\\n")[0]',
      "5 +   const headerText = rawRequest.split('\\r\\n\\r\\n')[0] ?? ''",
      '6     return { headers: parseHeaders(headerText) }',
    ])
    expect(renamedChunk.text).toContain('@@ +4,3 @@')
  })

  test('renders a hunk that only removes lines with the +0,0 header', () => {
    // a modified file with added lines in one hunk and only removed lines in another
    const removedHunkChangedFile: ChangedFile = {
      ...sqlInjectionChangedFile,
      hunks: [
        ...sqlInjectionChangedFile.hunks,
        ...removedOnlyChangedFile.hunks.map((hunk) => ({
          ...hunk,
          lines: hunk.lines.filter((hunkLine) => hunkLine.kind === 'removed'),
        })),
      ],
    }

    const packet = assembleReviewPacket({
      changedFiles: [removedHunkChangedFile],
      contextLines: testContextLines,
    })

    // the removed-only hunk renders the +0,0 header and its lines at 0
    const chunk = findChunk(packet, sqlInjectionChangedFile.path)
    expect(chunk.text).toContain('@@ +0,0 @@')
    expect(chunk.text).toContain(
      '0 -   console.log("input tokens: " + usage.inputTokens)',
    )
  })
})

describe('assembleReviewPacket hash', () => {
  test('is 64 lowercase hex characters and the same across two runs', () => {
    // assemble the named packet twice
    const firstPacket = assembleNamedPacket()
    const secondPacket = assembleNamedPacket()

    expect(firstPacket.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(secondPacket.hash).toBe(firstPacket.hash)
  })

  test('is the sha256 of the chunk texts joined by newline', () => {
    const packet = assembleNamedPacket()

    // hash the same texts directly
    const hasher = new Bun.CryptoHasher('sha256')
    hasher.update(packet.chunks.map((chunk) => chunk.text).join('\n'))

    expect(packet.hash).toBe(hasher.digest('hex'))
  })

  test('changes when the text of one added line changes', () => {
    // assemble the fixture and a copy with one added line changed
    const originalPacket = assembleReviewPacket({
      changedFiles: [sqlInjectionChangedFile],
      contextLines: testContextLines,
    })
    const changedPacket = assembleReviewPacket({
      changedFiles: [renameQueryTable()],
      contextLines: testContextLines,
    })

    expect(changedPacket.hash).not.toBe(originalPacket.hash)
  })
})
