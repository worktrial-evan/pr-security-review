// tests for parseUnifiedDiff: hand-written diffs for every file status and a diff git itself produced
import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanGitEnvironment } from './git-environment'
import { parseUnifiedDiff } from './unified-diff'

// the environment the repository is built with, so a git hook running the tests cannot redirect them
const gitEnvironment = cleanGitEnvironment()

// a file git created from nothing
const addedFileDiff = [
  'diff --git a/src/new.ts b/src/new.ts',
  'new file mode 100644',
  'index 0000000..3e75765',
  '--- /dev/null',
  '+++ b/src/new.ts',
  '@@ -0,0 +1,2 @@',
  '+const first = 1',
  '+export { first }',
  '',
].join('\n')

// a file with one replaced line and one removed line in two hunks
const modifiedFileDiff = [
  'diff --git a/src/app.ts b/src/app.ts',
  'index de98044..7be73ce 100644',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -2 +2 @@ const first = 1',
  '-const second = 2',
  '+const second = 22',
  '@@ -5 +4,0 @@ const fourth = 4',
  '-const fifth = 5',
  '',
].join('\n')

// a file git removed
const deletedFileDiff = [
  'diff --git a/src/gone.ts b/src/gone.ts',
  'deleted file mode 100644',
  'index 286c5f5..0000000',
  '--- a/src/gone.ts',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-const gone = true',
  '-export { gone }',
  '',
].join('\n')

// a file git moved and changed one line of
const renamedFileDiff = [
  'diff --git a/src/old-name.ts b/src/new-name.ts',
  'similarity index 90%',
  'rename from src/old-name.ts',
  'rename to src/new-name.ts',
  'index f0f2307..7e1e910 100644',
  '--- a/src/old-name.ts',
  '+++ b/src/new-name.ts',
  '@@ -3 +3 @@',
  '-const third = 3',
  '+const third = 33',
  '',
].join('\n')

// a binary file git cannot show line by line
const binaryFileDiff = [
  'diff --git a/assets/logo.png b/assets/logo.png',
  'index 8352675..1592e5c 100644',
  'Binary files a/assets/logo.png and b/assets/logo.png differ',
  '',
].join('\n')

// a diff with three context lines and a missing final newline
const contextDiff = [
  'diff --git a/notes.txt b/notes.txt',
  'index 1111111..2222222 100644',
  '--- a/notes.txt',
  '+++ b/notes.txt',
  '@@ -1,3 +1,4 @@',
  ' one',
  ' two',
  '+two and a half',
  ' three',
  '\\ No newline at end of file',
  '',
].join('\n')

describe('parseUnifiedDiff', () => {
  test('returns no files for empty text', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })

  test('reads an added file with every line as an added line', () => {
    const [changedFile] = parseUnifiedDiff(addedFileDiff)
    expect(changedFile).toEqual({
      path: 'src/new.ts',
      status: 'added',
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 2,
          lines: [
            { kind: 'added', headLine: 1, text: 'const first = 1' },
            { kind: 'added', headLine: 2, text: 'export { first }' },
          ],
        },
      ],
      addedLines: [
        { line: 1, text: 'const first = 1' },
        { line: 2, text: 'export { first }' },
      ],
      isBinary: false,
    })
    expect(changedFile?.previousPath).toBeUndefined()
  })

  test('reads a modified file with the omitted counts defaulting to one', () => {
    const [changedFile] = parseUnifiedDiff(modifiedFileDiff)
    expect(changedFile?.status).toBe('modified')
    expect(changedFile?.path).toBe('src/app.ts')
    expect(changedFile?.hunks).toEqual([
      {
        oldStart: 2,
        oldLines: 1,
        newStart: 2,
        newLines: 1,
        lines: [
          { kind: 'removed', headLine: 2, text: 'const second = 2' },
          { kind: 'added', headLine: 2, text: 'const second = 22' },
        ],
      },
      {
        oldStart: 5,
        oldLines: 1,
        newStart: 4,
        newLines: 0,
        lines: [{ kind: 'removed', headLine: 5, text: 'const fifth = 5' }],
      },
    ])
    expect(changedFile?.addedLines).toEqual([
      { line: 2, text: 'const second = 22' },
    ])
  })

  test('reads a deleted file with no added lines', () => {
    const [changedFile] = parseUnifiedDiff(deletedFileDiff)
    expect(changedFile?.status).toBe('deleted')
    expect(changedFile?.path).toBe('src/gone.ts')
    expect(changedFile?.addedLines).toEqual([])
    expect(changedFile?.hunks[0]?.lines.map((line) => line.kind)).toEqual([
      'removed',
      'removed',
    ])
  })

  test('reads a renamed file with its previous path', () => {
    const [changedFile] = parseUnifiedDiff(renamedFileDiff)
    expect(changedFile?.status).toBe('renamed')
    expect(changedFile?.path).toBe('src/new-name.ts')
    expect(changedFile?.previousPath).toBe('src/old-name.ts')
    expect(changedFile?.addedLines).toEqual([
      { line: 3, text: 'const third = 33' },
    ])
  })

  test('flags a binary file and gives it no hunks', () => {
    const [changedFile] = parseUnifiedDiff(binaryFileDiff)
    expect(changedFile).toEqual({
      path: 'assets/logo.png',
      status: 'modified',
      hunks: [],
      addedLines: [],
      isBinary: true,
    })
  })

  test('numbers context lines and ignores the no newline marker', () => {
    const [changedFile] = parseUnifiedDiff(contextDiff)
    expect(changedFile?.hunks[0]?.lines).toEqual([
      { kind: 'context', headLine: 1, text: 'one' },
      { kind: 'context', headLine: 2, text: 'two' },
      { kind: 'added', headLine: 3, text: 'two and a half' },
      { kind: 'context', headLine: 4, text: 'three' },
    ])
    expect(changedFile?.addedLines).toEqual([
      { line: 3, text: 'two and a half' },
    ])
  })

  test('splits a diff holding several files in order', () => {
    const changedFiles = parseUnifiedDiff(
      addedFileDiff + modifiedFileDiff + binaryFileDiff,
    )
    expect(changedFiles.map((changedFile) => changedFile.path)).toEqual([
      'src/new.ts',
      'src/app.ts',
      'assets/logo.png',
    ])
  })

  test('parses a diff git produced between two commits', async () => {
    // build a repository with two commits
    const repositoryDirectory = await mkdtemp(
      join(tmpdir(), 'pull-request-review-unified-diff-'),
    )
    try {
      await Bun.$`git init --quiet ${repositoryDirectory}`
        .env(gitEnvironment)
        .quiet()
      await Bun.$`git -C ${repositoryDirectory} config user.email benchmark@example.test`
        .env(gitEnvironment)
        .quiet()
      await Bun.$`git -C ${repositoryDirectory} config user.name benchmark`
        .env(gitEnvironment)
        .quiet()
      await Bun.write(
        join(repositoryDirectory, 'app.ts'),
        'const first = 1\nconst second = 2\nconst third = 3\n',
      )
      await Bun.write(join(repositoryDirectory, 'gone.ts'), 'const gone = 1\n')
      await Bun.$`git -C ${repositoryDirectory} add --all`
        .env(gitEnvironment)
        .quiet()
      await Bun.$`git -C ${repositoryDirectory} commit --quiet --message first`
        .env(gitEnvironment)
        .quiet()
      await Bun.write(
        join(repositoryDirectory, 'app.ts'),
        'const first = 1\nconst second = 22\nconst third = 3\nconst fourth = 4\n',
      )
      await Bun.write(join(repositoryDirectory, 'new.ts'), 'const added = 1\n')
      await rm(join(repositoryDirectory, 'gone.ts'))
      await Bun.$`git -C ${repositoryDirectory} add --all`
        .env(gitEnvironment)
        .quiet()
      await Bun.$`git -C ${repositoryDirectory} commit --quiet --message second`
        .env(gitEnvironment)
        .quiet()

      // diff the two commits the way the git source does
      const diffText =
        await Bun.$`git -C ${repositoryDirectory} diff --unified=0 --no-color HEAD~1 HEAD`
          .env(gitEnvironment)
          .text()
      const changedFiles = parseUnifiedDiff(diffText)

      // expect one file per status with the added lines at their head line numbers
      expect(
        changedFiles.map((changedFile) => [
          changedFile.path,
          changedFile.status,
        ]),
      ).toEqual([
        ['app.ts', 'modified'],
        ['gone.ts', 'deleted'],
        ['new.ts', 'added'],
      ])
      expect(changedFiles[0]?.addedLines).toEqual([
        { line: 2, text: 'const second = 22' },
        { line: 4, text: 'const fourth = 4' },
      ])
      expect(changedFiles[2]?.addedLines).toEqual([
        { line: 1, text: 'const added = 1' },
      ])
    } finally {
      await rm(repositoryDirectory, { recursive: true, force: true })
    }
  })
})
