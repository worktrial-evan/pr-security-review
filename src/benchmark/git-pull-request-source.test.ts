// tests for GitPullRequestSource over a local repository with two commits reached through a file url
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { cacheDirectoryEnvironmentVariable } from '@/shared/cache-directory'
import { cleanGitEnvironment } from './git-environment'
import {
  GitPullRequestSource,
  isGitSourceOffline,
  OfflineCloneError,
  offlineEnvironmentVariable,
} from './git-pull-request-source'
import {
  type RestoreEnvironmentVariables,
  saveEnvironmentVariables,
} from './test-environment'

// the content of the file both commits hold, with one line changed in the second
const baseAppText = 'const first = 1\nconst second = 2\nconst third = 3\n'
const headAppText = 'const first = 1\nconst second = 22\nconst third = 3\n'

// the file only the second commit holds
const newFileText = 'const added = 1\n'

// the environment the repository is built with, so a git hook running the tests cannot redirect them
const gitEnvironment = cleanGitEnvironment()

// the temporary repository, its file url and the shas of its two commits
let repositoryDirectory: string
let repoUrl: string
let baseSha: string
let headSha: string

// the temporary cache directory every clone lands in
let cacheDirectory: string

// puts the cache and offline variables back after each test
let restoreEnvironmentVariables: RestoreEnvironmentVariables

beforeEach(async () => {
  // save the environment and point the cache at a temporary directory
  restoreEnvironmentVariables = saveEnvironmentVariables([
    cacheDirectoryEnvironmentVariable,
    offlineEnvironmentVariable,
  ])
  cacheDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-cache-'))
  process.env[cacheDirectoryEnvironmentVariable] = cacheDirectory
  delete process.env[offlineEnvironmentVariable]

  // build a repository with two commits
  repositoryDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-repository-'),
  )
  repoUrl = `file://${repositoryDirectory}`
  await Bun.$`git init --quiet ${repositoryDirectory}`
    .env(gitEnvironment)
    .quiet()
  await Bun.$`git -C ${repositoryDirectory} config user.email benchmark@example.test`
    .env(gitEnvironment)
    .quiet()
  await Bun.$`git -C ${repositoryDirectory} config user.name benchmark`
    .env(gitEnvironment)
    .quiet()
  await Bun.write(join(repositoryDirectory, 'app.ts'), baseAppText)
  await Bun.$`git -C ${repositoryDirectory} add --all`
    .env(gitEnvironment)
    .quiet()
  await Bun.$`git -C ${repositoryDirectory} commit --quiet --message first`
    .env(gitEnvironment)
    .quiet()
  await Bun.write(join(repositoryDirectory, 'app.ts'), headAppText)
  await Bun.write(join(repositoryDirectory, 'new.ts'), newFileText)
  await Bun.$`git -C ${repositoryDirectory} add --all`
    .env(gitEnvironment)
    .quiet()
  await Bun.$`git -C ${repositoryDirectory} commit --quiet --message second`
    .env(gitEnvironment)
    .quiet()
  baseSha = (
    await Bun.$`git -C ${repositoryDirectory} rev-parse HEAD~1`
      .env(gitEnvironment)
      .text()
  ).trim()
  headSha = (
    await Bun.$`git -C ${repositoryDirectory} rev-parse HEAD`
      .env(gitEnvironment)
      .text()
  ).trim()
})

afterEach(async () => {
  // put the environment back and remove the temporary directories
  restoreEnvironmentVariables()
  await rm(cacheDirectory, { recursive: true, force: true })
  await rm(repositoryDirectory, { recursive: true, force: true })
})

describe('GitPullRequestSource', () => {
  test('lists the files the second commit changed from a clone under the cache directory', async () => {
    const source = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })

    // the source describes the two shas
    expect(await source.describe()).toEqual({ baseSha, headSha })

    // the changed files come with their added lines at head line numbers
    const changedFiles = await source.listChangedFiles()
    expect(
      changedFiles.map((changedFile) => [changedFile.path, changedFile.status]),
    ).toEqual([
      ['app.ts', 'modified'],
      ['new.ts', 'added'],
    ])
    expect(changedFiles[0]?.addedLines).toEqual([
      { line: 2, text: 'const second = 22' },
    ])

    // the clone lives under benchmark-repos/local/<parent>/<repository> in the cache
    const cloneDirectory = expectedCloneDirectory()
    expect(await Bun.file(join(cloneDirectory, '.git', 'HEAD')).exists()).toBe(
      true,
    )
    await source.dispose()
  })

  test('reads files at either sha and null when the sha does not hold the file', async () => {
    const source = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })
    expect(await source.readFileAtBase('app.ts')).toBe(baseAppText)
    expect(await source.readFileAtHead('app.ts')).toBe(headAppText)
    expect(await source.readFileAtBase('new.ts')).toBeNull()
    expect(await source.readFileAtHead('new.ts')).toBe(newFileText)
    await source.dispose()
  })

  test('reuses the clone on a second open', async () => {
    // open once and leave a marker inside the clone
    const firstSource = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })
    const markerPath = join(expectedCloneDirectory(), 'reuse-marker.txt')
    await Bun.write(markerPath, 'left by the first open\n')
    await firstSource.dispose()

    // open again and expect the same clone with the marker still in it
    const secondSource = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })
    expect(await Bun.file(markerPath).exists()).toBe(true)
    const cloneDirectoryNames = await readdir(dirname(expectedCloneDirectory()))
    expect(cloneDirectoryNames).toEqual([basename(repositoryDirectory)])
    expect(await secondSource.listChangedFiles()).toHaveLength(2)
    await secondSource.dispose()
  })

  test('opens an existing clone while offline', async () => {
    // clone while online, then flip the offline flag
    const firstSource = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })
    await firstSource.dispose()
    process.env[offlineEnvironmentVariable] = '1'
    expect(isGitSourceOffline()).toBe(true)

    // the clone is reused without touching the network
    const offlineSource = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })
    expect(await offlineSource.readFileAtHead('new.ts')).toBe(newFileText)
    await offlineSource.dispose()
  })

  test('checks head out into a worktree that dispose removes', async () => {
    const source = await GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha,
    })

    // the worktree holds the head content
    const worktreeDirectory = await source.checkoutHead()
    expect(await Bun.file(join(worktreeDirectory, 'app.ts')).text()).toBe(
      headAppText,
    )
    expect(await Bun.file(join(worktreeDirectory, 'new.ts')).text()).toBe(
      newFileText,
    )

    // a second checkout returns the same directory
    expect(await source.checkoutHead()).toBe(worktreeDirectory)

    // dispose removes the directory
    await source.dispose()
    expect(await Bun.file(join(worktreeDirectory, 'app.ts')).exists()).toBe(
      false,
    )
  })

  test('throws OfflineCloneError before cloning when the offline flag is set', async () => {
    process.env[offlineEnvironmentVariable] = '1'
    const openPromise = GitPullRequestSource.open({ repoUrl, baseSha, headSha })
    await expect(openPromise).rejects.toBeInstanceOf(OfflineCloneError)
    expect(
      await Bun.file(join(expectedCloneDirectory(), '.git', 'HEAD')).exists(),
    ).toBe(false)
  })

  test('throws OfflineCloneError when the repository cannot be reached', async () => {
    const unreachableRepoUrl = 'https://127.0.0.1:9/none/none.git'
    const openPromise = GitPullRequestSource.open({
      repoUrl: unreachableRepoUrl,
      baseSha,
      headSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(OfflineCloneError)
    if (openError instanceof OfflineCloneError) {
      expect(openError.repoUrl).toBe(unreachableRepoUrl)
    }

    // the failed clone leaves no host or owner directory behind
    expect(existsSync(join(cacheDirectory, 'benchmark-repos'))).toBe(false)
  })

  test('reports a local path that is not a repository as a plain error', async () => {
    // a file url nothing is at: git fails without naming the network
    const missingRepoUrl = `file://${join(repositoryDirectory, 'missing')}`
    const openPromise = GitPullRequestSource.open({
      repoUrl: missingRepoUrl,
      baseSha,
      headSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(Error)
    expect(openError).not.toBeInstanceOf(OfflineCloneError)
    expect(existsSync(join(cacheDirectory, 'benchmark-repos'))).toBe(false)
  })

  test('reports a sha the repository does not hold as a plain error', async () => {
    const missingSha = '0000000000000000000000000000000000000000'
    const openPromise = GitPullRequestSource.open({
      repoUrl,
      baseSha,
      headSha: missingSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(Error)
    expect(openError).not.toBeInstanceOf(OfflineCloneError)
  })
})

// the clone directory open derives from the file url: local plus the last two path segments
function expectedCloneDirectory(): string {
  return join(
    cacheDirectory,
    'benchmark-repos',
    'local',
    basename(dirname(repositoryDirectory)),
    basename(repositoryDirectory),
  )
}
