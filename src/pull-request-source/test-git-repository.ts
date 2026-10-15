// builds a temporary git repository with a base commit and a head commit for the source tests
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'
import { runGit } from './git-command'

// identity and signing settings so a commit works on any machine
const commitArguments = [
  '-c',
  'user.name=pull request source tests',
  '-c',
  'user.email=tests@example.invalid',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '--quiet',
  '--no-verify',
  '--allow-empty',
]

export interface CreateTwoCommitRepositoryOptions {
  baseDir: string
  headDir: string
}

// a repository whose two commits hold the base tree and the head tree
export interface TwoCommitRepository {
  repoPath: string
  baseSha: string
  headSha: string
}

/**
 * Creates a temporary repository whose first commit holds baseDir's files and whose second holds headDir's.
 */
export async function createTwoCommitRepository({
  baseDir,
  headDir,
}: CreateTwoCommitRepositoryOptions): Promise<TwoCommitRepository> {
  const repoPath = await mkdtemp(join(tmpdir(), 'pull-request-repository-'))
  await runGit({ repoPath, gitArguments: ['init', '--quiet'] })
  const baseSha = await commitTree({
    repoPath,
    treeDir: baseDir,
    message: 'base',
  })
  const headSha = await commitTree({
    repoPath,
    treeDir: headDir,
    message: 'head',
  })
  return { repoPath, baseSha, headSha }
}

interface CommitTreeOptions {
  repoPath: string
  treeDir: string
  message: string
}

// replace the tracked files with a tree's files, commit them and return the new sha
async function commitTree({
  repoPath,
  treeDir,
  message,
}: CommitTreeOptions): Promise<string> {
  // swap the working tree for the tree's files
  await runGit({
    repoPath,
    gitArguments: ['rm', '-r', '--quiet', '--ignore-unmatch', '.'],
  })
  await $`cp -R ${treeDir}/. ${repoPath}`.quiet()

  // commit everything and read the sha back
  await runGit({ repoPath, gitArguments: ['add', '--all'] })
  await runGit({
    repoPath,
    gitArguments: [...commitArguments, '--message', message],
  })
  const headOutput = await runGit({
    repoPath,
    gitArguments: ['rev-parse', 'HEAD'],
  })
  return headOutput.trim()
}
