// tests the git source over a two-commit repository the test builds in a temporary directory
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runGit } from './git-command'
import { GitPullRequestSource } from './git-pull-request-source'
import {
  createTwoCommitRepository,
  type TwoCommitRepository,
} from './test-git-repository'

// ten numbered lines for the file the pull request edits
const appBaseText = Array.from(
  { length: 10 },
  (_, i) => `app line ${i + 1}\n`,
).join('')

// line 5 rewritten and line 11 appended
const appHeadText = `${appBaseText.replace('app line 5\n', 'app line 5 calls the payments api\n')}app line 11\n`

// the temporary trees and the repository built from them
let treesDirectory = ''
let repository: TwoCommitRepository = { repoPath: '', baseSha: '', headSha: '' }

beforeAll(async () => {
  // write a base tree and a head tree that add, edit, delete and rename one file each
  treesDirectory = await mkdtemp(join(tmpdir(), 'git-source-trees-'))
  const baseDir = join(treesDirectory, 'base')
  const headDir = join(treesDirectory, 'head')
  await Bun.write(join(baseDir, 'app.txt'), appBaseText)
  await Bun.write(join(baseDir, 'gone.txt'), 'this file is deleted\n')
  await Bun.write(join(baseDir, 'docs', 'old.txt'), 'this file is renamed\n')
  await Bun.write(join(headDir, 'app.txt'), appHeadText)
  await Bun.write(join(headDir, 'docs', 'new.txt'), 'this file is renamed\n')
  await Bun.write(join(headDir, 'fresh file.txt'), 'this file is added\n')

  // commit both trees
  repository = await createTwoCommitRepository({ baseDir, headDir })
})

afterAll(async () => {
  await rm(treesDirectory, { recursive: true, force: true })
  await rm(repository.repoPath, { recursive: true, force: true })
})

// a source over the test repository
function createSource(): GitPullRequestSource {
  return new GitPullRequestSource(repository)
}

describe('GitPullRequestSource.listChangedFiles', () => {
  test('lists every changed file with its status, sorted by path', async () => {
    const changedFiles = await createSource().listChangedFiles()
    const fileStatuses = changedFiles.map((changedFile) => [
      changedFile.path,
      changedFile.status,
      changedFile.previousPath,
    ])
    expect(fileStatuses).toEqual([
      ['app.txt', 'modified', undefined],
      ['docs/new.txt', 'renamed', 'docs/old.txt'],
      ['fresh file.txt', 'added', undefined],
      ['gone.txt', 'deleted', undefined],
    ])
  })

  test('records every added line and merges nearby edits into one hunk', async () => {
    const changedFiles = await createSource().listChangedFiles()
    const appFile = changedFiles.find(
      (changedFile) => changedFile.path === 'app.txt',
    )
    expect(appFile?.addedLines).toEqual([
      { line: 5, text: 'app line 5 calls the payments api' },
      { line: 11, text: 'app line 11' },
    ])
    expect(appFile?.hunks.map((hunk) => hunk.newStart)).toEqual([2])
  })

  test('gives the same output when the repository config changes diff settings', async () => {
    // read the files, then set config that would change prefixes, color and the algorithm
    const defaultChangedFiles = await createSource().listChangedFiles()
    const configSettings = [
      ['diff.noprefix', 'true'],
      ['color.diff', 'always'],
      ['diff.algorithm', 'histogram'],
      ['diff.renames', 'copies'],
      ['core.quotepath', 'true'],
    ]
    for (const [configKey = '', configValue = ''] of configSettings) {
      await runGit({
        repoPath: repository.repoPath,
        gitArguments: ['config', configKey, configValue],
      })
    }

    // expect the same changed files, then remove the settings again
    const configuredChangedFiles = await createSource().listChangedFiles()
    for (const [configKey = ''] of configSettings) {
      await runGit({
        repoPath: repository.repoPath,
        gitArguments: ['config', '--unset', configKey],
      })
    }
    expect(configuredChangedFiles).toEqual(defaultChangedFiles)
  })
})

describe('GitPullRequestSource file access', () => {
  test('reads files at each sha and returns null where a file is missing', async () => {
    const gitSource = createSource()
    expect(await gitSource.readFileAtBase('fresh file.txt')).toBeNull()
    expect(await gitSource.readFileAtHead('fresh file.txt')).toBe(
      'this file is added\n',
    )
    expect(await gitSource.readFileAtBase('gone.txt')).toBe(
      'this file is deleted\n',
    )
    expect(await gitSource.readFileAtHead('gone.txt')).toBeNull()
  })

  test('describes both shas', async () => {
    const { baseSha, headSha } = repository
    expect(await createSource().describe()).toEqual({ baseSha, headSha })
  })

  test('checks the head out once into a worktree that dispose removes', async () => {
    // check out twice and expect one directory holding the head files
    const gitSource = createSource()
    const worktreePath = await gitSource.checkoutHead()
    expect(await gitSource.checkoutHead()).toBe(worktreePath)
    expect(await Bun.file(join(worktreePath, 'app.txt')).text()).toBe(
      appHeadText,
    )
    expect(existsSync(join(worktreePath, 'gone.txt'))).toBe(false)

    // dispose and expect the directory and the worktree entry gone
    await gitSource.dispose()
    expect(existsSync(worktreePath)).toBe(false)
    const worktreeList = await runGit({
      repoPath: repository.repoPath,
      gitArguments: ['worktree', 'list'],
    })
    expect(worktreeList).not.toContain(worktreePath)
  })
})
