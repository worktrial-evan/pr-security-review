// tests for SnapshotPullRequestSource over temporary base and head trees
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnapshotPullRequestSource } from './snapshot-pull-request-source'

// the content of the file both trees hold, with one line changed in head
const baseAppText = 'const first = 1\nconst second = 2\nconst third = 3\n'
const headAppText = 'const first = 1\nconst second = 22\nconst third = 3\n'

// the file only head holds
const newFileText = 'const added = 1\nexport { added }\n'

// the temporary case directory with its base and head trees
let caseDirectory: string
let baseDirectory: string
let headDirectory: string

beforeEach(async () => {
  // write the base tree and the head tree
  caseDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-snapshot-'))
  baseDirectory = join(caseDirectory, 'base')
  headDirectory = join(caseDirectory, 'head')
  await mkdir(join(baseDirectory, 'src'), { recursive: true })
  await mkdir(join(headDirectory, 'src'), { recursive: true })
  await Bun.write(join(baseDirectory, 'src', 'app.ts'), baseAppText)
  await Bun.write(join(baseDirectory, 'src', 'gone.ts'), 'const gone = 1\n')
  await Bun.write(join(headDirectory, 'src', 'app.ts'), headAppText)
  await Bun.write(join(headDirectory, 'src', 'new.ts'), newFileText)
})

afterEach(async () => {
  await rm(caseDirectory, { recursive: true, force: true })
})

describe('SnapshotPullRequestSource', () => {
  test('describes the default shas and the ones given', async () => {
    const defaultSource = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
    })
    expect(await defaultSource.describe()).toEqual({
      baseSha: 'base',
      headSha: 'head',
    })

    const namedSource = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
      baseSha: 'abc123',
      headSha: 'def456',
    })
    expect(await namedSource.describe()).toEqual({
      baseSha: 'abc123',
      headSha: 'def456',
    })
  })

  test('lists the added, modified and deleted files relative to the trees', async () => {
    const source = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
    })
    const changedFiles = await source.listChangedFiles()

    // expect one file per status, in path order, with tree-relative paths
    expect(
      changedFiles.map((changedFile) => [changedFile.path, changedFile.status]),
    ).toEqual([
      ['src/app.ts', 'modified'],
      ['src/gone.ts', 'deleted'],
      ['src/new.ts', 'added'],
    ])

    // the modified file has one added line at its head line number
    expect(changedFiles[0]?.addedLines).toEqual([
      { line: 2, text: 'const second = 22' },
    ])

    // the added file has every line as an added line
    expect(changedFiles[2]?.addedLines).toEqual([
      { line: 1, text: 'const added = 1' },
      { line: 2, text: 'export { added }' },
    ])
    expect(changedFiles[2]?.isBinary).toBe(false)
  })

  test('lists nothing when the trees are equal', async () => {
    const source = new SnapshotPullRequestSource({
      baseDirectory: headDirectory,
      headDirectory,
    })
    expect(await source.listChangedFiles()).toEqual([])
  })

  test('reads null at base for a file only head holds', async () => {
    const source = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
    })
    expect(await source.readFileAtBase('src/new.ts')).toBeNull()
    expect(await source.readFileAtHead('src/new.ts')).toBe(newFileText)
    expect(await source.readFileAtBase('src/app.ts')).toBe(baseAppText)
    expect(await source.readFileAtHead('src/app.ts')).toBe(headAppText)
    expect(await source.readFileAtHead('src/gone.ts')).toBeNull()
  })

  test('checks out head as the head directory', async () => {
    const source = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
    })
    expect(await source.checkoutHead()).toBe(headDirectory)
    await source.dispose()
  })
})
