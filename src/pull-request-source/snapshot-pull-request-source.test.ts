// tests the snapshot source over the base and head fixture trees
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { ChangedFile } from '@/shared/pull-request-source'
import { SnapshotPullRequestSource } from './snapshot-pull-request-source'

// the fixture trees: one added, modified, deleted, renamed, moved-and-edited and binary file each
const snapshotFixtureDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'pull-request-source',
  'snapshot',
)
const baseDirectory = join(snapshotFixtureDirectory, 'base')
const headDirectory = join(snapshotFixtureDirectory, 'head')

// the source every test reads
const snapshotSource = new SnapshotPullRequestSource({
  baseDirectory,
  headDirectory,
})

describe('SnapshotPullRequestSource.listChangedFiles', () => {
  test('lists every changed file with its status, sorted by path', async () => {
    const changedFiles = await snapshotSource.listChangedFiles()

    // expect the moved-and-edited file as a deletion plus an addition
    const fileStatuses = changedFiles.map((changedFile) => [
      changedFile.path,
      changedFile.status,
      changedFile.previousPath,
    ])
    expect(fileStatuses).toEqual([
      ['added.txt', 'added', undefined],
      ['assets/logo.bin', 'modified', undefined],
      ['config/settings.txt', 'deleted', undefined],
      ['deleted.txt', 'deleted', undefined],
      ['docs/new-name.txt', 'renamed', 'docs/old-name.txt'],
      ['modified.txt', 'modified', undefined],
      ['settings/settings.txt', 'added', undefined],
    ])
  })

  test('splits distant edits into two hunks and records the added lines', async () => {
    const modifiedFile = await findChangedFile('modified.txt')

    // expect line 5 changed in one hunk and line 13 appended in another
    const hunkHeaders = modifiedFile.hunks.map((hunk) => [
      hunk.oldStart,
      hunk.oldLines,
      hunk.newStart,
      hunk.newLines,
    ])
    expect(hunkHeaders).toEqual([
      [2, 7, 2, 7],
      [10, 3, 10, 4],
    ])
    expect(modifiedFile.addedLines).toEqual([
      {
        line: 5,
        text: 'modified line 5 now reads an api key from the environment',
      },
      { line: 13, text: 'modified line 13 is appended' },
    ])
    expect(modifiedFile.isBinary).toBe(false)
  })

  test('gives an added file one hunk from line 0 with every line added', async () => {
    const addedFile = await findChangedFile('added.txt')
    expect(addedFile.hunks).toHaveLength(1)
    expect(addedFile.hunks[0]?.oldStart).toBe(0)
    expect(addedFile.addedLines).toEqual([
      { line: 1, text: 'This file is added by the pull request.' },
      { line: 2, text: 'It has a second line.' },
      { line: 3, text: 'And a third line without a final newline.' },
    ])
  })

  test('gives a deleted file removed lines with head line 0 and no added lines', async () => {
    const deletedFile = await findChangedFile('deleted.txt')
    const hunkLines = deletedFile.hunks.flatMap((hunk) => hunk.lines)
    expect(
      hunkLines.every(
        (hunkLine) => hunkLine.kind === 'removed' && hunkLine.headLine === 0,
      ),
    ).toBe(true)
    expect(deletedFile.addedLines).toEqual([])
  })

  test('gives an exact rename and a binary file no hunks and no added lines', async () => {
    const renamedFile = await findChangedFile('docs/new-name.txt')
    const binaryFile = await findChangedFile('assets/logo.bin')
    expect(renamedFile.hunks).toEqual([])
    expect(renamedFile.addedLines).toEqual([])
    expect(binaryFile.isBinary).toBe(true)
    expect(binaryFile.hunks).toEqual([])
    expect(binaryFile.addedLines).toEqual([])
  })
})

describe('SnapshotPullRequestSource file access', () => {
  test('reads a file at head and returns null at base for an added file', async () => {
    expect(await snapshotSource.readFileAtBase('added.txt')).toBeNull()
    expect(await snapshotSource.readFileAtHead('added.txt')).toStartWith(
      'This file is added',
    )
  })

  test('returns null for a path that leaves the tree', async () => {
    expect(
      await snapshotSource.readFileAtHead('../base/deleted.txt'),
    ).toBeNull()
  })

  test('checks out the head as the head directory and describes both trees', async () => {
    expect(await snapshotSource.checkoutHead()).toBe(headDirectory)
    expect(await snapshotSource.describe()).toEqual({
      baseSha: `snapshot:${baseDirectory}`,
      headSha: `snapshot:${headDirectory}`,
    })
    await snapshotSource.dispose()
  })
})

// find one changed file by path or fail the test
async function findChangedFile(path: string): Promise<ChangedFile> {
  const changedFiles = await snapshotSource.listChangedFiles()
  const changedFile = changedFiles.find(
    (candidateFile) => candidateFile.path === path,
  )
  if (changedFile === undefined) {
    throw new Error(`${path} is not a changed file`)
  }
  return changedFile
}
