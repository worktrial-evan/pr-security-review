// tests for openBenchmarkRepository over a local repository with two commits reached through a file url
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { runGit } from '@/pull-request-source/git-command'
import { cacheDirectoryEnvironmentVariable } from '@/shared/cache-directory'
import {
  isGitSourceOffline,
  OfflineCloneError,
  offlineEnvironmentVariable,
  openBenchmarkRepository,
} from './benchmark-repository'
import {
  type RestoreEnvironmentVariables,
  saveEnvironmentVariables,
} from './test-environment'

// the content of the file both commits hold, with one line changed in the second
const baseAppText = 'const first = 1\nconst second = 2\nconst third = 3\n'
const headAppText = 'const first = 1\nconst second = 22\nconst third = 3\n'

// the file only the second commit holds
const newFileText = 'const added = 1\n'

// the temporary repository, its file url and the shas of its two commits
let repositoryDirectory: string
let repositoryUrl: string
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
  repositoryUrl = `file://${repositoryDirectory}`
  await git(['init', '--quiet'])
  await git(['config', 'user.email', 'benchmark@example.test'])
  await git(['config', 'user.name', 'benchmark'])
  await Bun.write(join(repositoryDirectory, 'app.ts'), baseAppText)
  await git(['add', '--all'])
  await git(['commit', '--quiet', '--no-verify', '--message', 'first'])
  await Bun.write(join(repositoryDirectory, 'app.ts'), headAppText)
  await Bun.write(join(repositoryDirectory, 'new.ts'), newFileText)
  await git(['add', '--all'])
  await git(['commit', '--quiet', '--no-verify', '--message', 'second'])
  baseSha = (await git(['rev-parse', 'HEAD~1'])).trim()
  headSha = (await git(['rev-parse', 'HEAD'])).trim()
})

afterEach(async () => {
  // put the environment back and remove the temporary directories
  restoreEnvironmentVariables()
  await rm(cacheDirectory, { recursive: true, force: true })
  await rm(repositoryDirectory, { recursive: true, force: true })
})

describe('openBenchmarkRepository', () => {
  test('lists the files the second commit changed from a clone under the cache directory', async () => {
    const source = await openBenchmarkRepository({
      repositoryUrl,
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

    // the clone lives under benchmark-repositories/local/<parent>/<repository> in the cache
    const cloneDirectory = expectedCloneDirectory()
    expect(await Bun.file(join(cloneDirectory, '.git', 'HEAD')).exists()).toBe(
      true,
    )
    await source.dispose()
  })

  test('reads files at either sha and null when the sha does not hold the file', async () => {
    const source = await openBenchmarkRepository({
      repositoryUrl,
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
    const firstSource = await openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha,
    })
    const markerPath = join(expectedCloneDirectory(), 'reuse-marker.txt')
    await Bun.write(markerPath, 'left by the first open\n')
    await firstSource.dispose()

    // open again and expect the same clone with the marker still in it
    const secondSource = await openBenchmarkRepository({
      repositoryUrl,
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
    const firstSource = await openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha,
    })
    await firstSource.dispose()
    process.env[offlineEnvironmentVariable] = '1'
    expect(isGitSourceOffline()).toBe(true)

    // the clone is reused without touching the network
    const offlineSource = await openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha,
    })
    expect(await offlineSource.readFileAtHead('new.ts')).toBe(newFileText)
    await offlineSource.dispose()
  })

  test('checks head out into a worktree that dispose removes', async () => {
    const source = await openBenchmarkRepository({
      repositoryUrl,
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

    // dispose removes the directory
    await source.dispose()
    expect(await Bun.file(join(worktreeDirectory, 'app.ts')).exists()).toBe(
      false,
    )
  })

  test('throws OfflineCloneError before cloning when the offline flag is set', async () => {
    process.env[offlineEnvironmentVariable] = '1'
    const openPromise = openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha,
    })
    await expect(openPromise).rejects.toBeInstanceOf(OfflineCloneError)
    expect(
      await Bun.file(join(expectedCloneDirectory(), '.git', 'HEAD')).exists(),
    ).toBe(false)
  })

  test('throws OfflineCloneError when the repository cannot be reached', async () => {
    const unreachableRepositoryUrl = 'https://127.0.0.1:9/none/none.git'
    const openPromise = openBenchmarkRepository({
      repositoryUrl: unreachableRepositoryUrl,
      baseSha,
      headSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(OfflineCloneError)
    if (openError instanceof OfflineCloneError) {
      expect(openError.repositoryUrl).toBe(unreachableRepositoryUrl)
    }

    // the failed clone leaves no host or owner directory behind
    expect(existsSync(join(cacheDirectory, 'benchmark-repositories'))).toBe(
      false,
    )
  })

  test('reports a local path that is not a repository as a plain error', async () => {
    // a file url nothing is at: git fails without naming the network
    const missingRepositoryUrl = `file://${join(repositoryDirectory, 'missing')}`
    const openPromise = openBenchmarkRepository({
      repositoryUrl: missingRepositoryUrl,
      baseSha,
      headSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(Error)
    expect(openError).not.toBeInstanceOf(OfflineCloneError)
    expect(existsSync(join(cacheDirectory, 'benchmark-repositories'))).toBe(
      false,
    )
  })

  test('reports a sha the repository does not hold as a plain error', async () => {
    const missingSha = '0000000000000000000000000000000000000000'
    const openPromise = openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha: missingSha,
    })
    const openError = await openPromise.catch((error: unknown) => error)
    expect(openError).toBeInstanceOf(Error)
    expect(openError).not.toBeInstanceOf(OfflineCloneError)
  })
})

// run git in the temporary repository through the module's wrapper, so a hook environment cannot redirect it
function git(gitArguments: string[]): Promise<string> {
  return runGit({ repositoryPath: repositoryDirectory, gitArguments })
}

// the clone directory open derives from the file url: local plus the last two path segments
function expectedCloneDirectory(): string {
  return join(
    cacheDirectory,
    'benchmark-repositories',
    'local',
    basename(dirname(repositoryDirectory)),
    basename(repositoryDirectory),
  )
}
