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
  baseDirectory: string
  headDirectory: string
}

// a repository whose two commits hold the base tree and the head tree
export interface TwoCommitRepository {
  repositoryPath: string
  baseSha: string
  headSha: string
}

/**
 * Creates a temporary repository whose first commit holds baseDirectory's files and whose second holds headDirectory's.
 */
export async function createTwoCommitRepository({
  baseDirectory,
  headDirectory,
}: CreateTwoCommitRepositoryOptions): Promise<TwoCommitRepository> {
  const repositoryPath = await mkdtemp(
    join(tmpdir(), 'pull-request-repository-'),
  )
  await runGit({ repositoryPath, gitArguments: ['init', '--quiet'] })
  const baseSha = await commitTree({
    repositoryPath,
    treeDirectory: baseDirectory,
    message: 'base',
  })
  const headSha = await commitTree({
    repositoryPath,
    treeDirectory: headDirectory,
    message: 'head',
  })
  return { repositoryPath, baseSha, headSha }
}

interface CommitTreeOptions {
  repositoryPath: string
  treeDirectory: string
  message: string
}

// replace the tracked files with a tree's files, commit them and return the new sha
async function commitTree({
  repositoryPath,
  treeDirectory,
  message,
}: CommitTreeOptions): Promise<string> {
  // swap the working tree for the tree's files
  await runGit({
    repositoryPath,
    gitArguments: ['rm', '-r', '--quiet', '--ignore-unmatch', '.'],
  })
  await $`cp -R ${treeDirectory}/. ${repositoryPath}`.quiet()

  // commit everything and read the sha back
  await runGit({ repositoryPath, gitArguments: ['add', '--all'] })
  await runGit({
    repositoryPath,
    gitArguments: [...commitArguments, '--message', message],
  })
  const headOutput = await runGit({
    repositoryPath,
    gitArguments: ['rev-parse', 'HEAD'],
  })
  return headOutput.trim()
}
