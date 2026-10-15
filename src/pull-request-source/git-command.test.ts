// tests that git commands act on the given repository even when a git hook's environment points elsewhere
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitCommandError, runGit } from './git-command'

// a repository the commands target and a decoy repository the environment points at
let targetRepoPath = ''
let decoyRepoPath = ''

beforeAll(async () => {
  targetRepoPath = await realpath(
    await mkdtemp(join(tmpdir(), 'git-command-target-')),
  )
  decoyRepoPath = await realpath(
    await mkdtemp(join(tmpdir(), 'git-command-decoy-')),
  )
  await runGit({ repoPath: targetRepoPath, gitArguments: ['init', '--quiet'] })
  await runGit({ repoPath: decoyRepoPath, gitArguments: ['init', '--quiet'] })
})

afterAll(async () => {
  await rm(targetRepoPath, { recursive: true, force: true })
  await rm(decoyRepoPath, { recursive: true, force: true })
})

describe('runGit', () => {
  test('ignores GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE exported by a git hook', async () => {
    // point the process environment at the decoy, as a pre-commit hook does
    const savedEnvironment = { ...process.env }
    process.env.GIT_DIR = join(decoyRepoPath, '.git')
    process.env.GIT_WORK_TREE = decoyRepoPath
    process.env.GIT_INDEX_FILE = join(decoyRepoPath, '.git', 'index')

    // ask git where it is working, then restore the environment
    const gitDirOutput = await runGit({
      repoPath: targetRepoPath,
      gitArguments: ['rev-parse', '--absolute-git-dir'],
    }).finally(() => {
      process.env = savedEnvironment
    })

    expect(gitDirOutput.trim()).toBe(join(targetRepoPath, '.git'))
  })

  test('throws a GitCommandError with git stderr on a non-zero exit', async () => {
    const gitError = await runGit({
      repoPath: targetRepoPath,
      gitArguments: ['rev-parse', 'no-such-ref'],
    }).catch((error: unknown) => error)
    expect(gitError).toBeInstanceOf(GitCommandError)
    expect((gitError as GitCommandError).stderr).toContain('no-such-ref')
  })
})
