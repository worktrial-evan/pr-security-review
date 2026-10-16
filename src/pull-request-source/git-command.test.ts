// tests that git commands act on the given repository even when a git hook's environment points elsewhere
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitCommandError, runGit } from './git-command'

// a repository the commands target and a decoy repository the environment points at
let targetRepositoryPath = ''
let decoyRepositoryPath = ''

beforeAll(async () => {
  targetRepositoryPath = await realpath(
    await mkdtemp(join(tmpdir(), 'git-command-target-')),
  )
  decoyRepositoryPath = await realpath(
    await mkdtemp(join(tmpdir(), 'git-command-decoy-')),
  )
  await runGit({
    repositoryPath: targetRepositoryPath,
    gitArguments: ['init', '--quiet'],
  })
  await runGit({
    repositoryPath: decoyRepositoryPath,
    gitArguments: ['init', '--quiet'],
  })
})

afterAll(async () => {
  await rm(targetRepositoryPath, { recursive: true, force: true })
  await rm(decoyRepositoryPath, { recursive: true, force: true })
})

describe('runGit', () => {
  test('ignores GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE exported by a git hook', async () => {
    // point the process environment at the decoy, as a pre-commit hook does
    const savedEnvironment = { ...process.env }
    process.env.GIT_DIR = join(decoyRepositoryPath, '.git')
    process.env.GIT_WORK_TREE = decoyRepositoryPath
    process.env.GIT_INDEX_FILE = join(decoyRepositoryPath, '.git', 'index')

    // ask git where it is working, then restore the environment
    const gitDirectoryOutput = await runGit({
      repositoryPath: targetRepositoryPath,
      gitArguments: ['rev-parse', '--absolute-git-dir'],
    }).finally(() => {
      process.env = savedEnvironment
    })

    expect(gitDirectoryOutput.trim()).toBe(join(targetRepositoryPath, '.git'))
  })

  test('throws a GitCommandError with git stderr on a non-zero exit', async () => {
    const gitError = await runGit({
      repositoryPath: targetRepositoryPath,
      gitArguments: ['rev-parse', 'no-such-ref'],
    }).catch((error: unknown) => error)
    expect(gitError).toBeInstanceOf(GitCommandError)
    expect((gitError as GitCommandError).stderr).toContain('no-such-ref')
  })
})
