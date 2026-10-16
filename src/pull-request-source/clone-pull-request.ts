// clones a GitHub pull request's repository into a cache directory and returns a git source for it
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PullRequestReference } from '@/shared/pull-request-source'
import { GitCommandError, runGit } from './git-command'
import { GitPullRequestSource } from './git-pull-request-source'
import { fetchPullRequestShas } from './github-api'

// the git config key that adds a header to requests to github.com only
const githubExtraHeaderKey = 'http.https://github.com/.extraheader'

export interface ClonePullRequestOptions {
  reference: PullRequestReference
  cacheDirectory: string
  token?: string
  contextLines?: number
  remoteUrl?: string
}

/**
 * Clones or reuses the pull request's repository under cacheDirectory, fetches its base and head, and returns a git source for them.
 */
export async function clonePullRequest({
  reference,
  cacheDirectory,
  token,
  contextLines,
  remoteUrl = `https://github.com/${reference.owner}/${reference.repository}.git`,
}: ClonePullRequestOptions): Promise<GitPullRequestSource> {
  // read the base and head shas from GitHub
  const { baseSha, headSha } = await fetchPullRequestShas({ reference, token })
  const environment = buildGitAuthEnvironment(token)

  // shallow-clone the repository as a bare cache entry when it is not there yet
  const repositoryPath = join(
    cacheDirectory,
    reference.owner,
    reference.repository,
  )
  const isCloned = existsSync(join(repositoryPath, 'HEAD'))
  if (!isCloned) {
    await mkdir(dirname(repositoryPath), { recursive: true })
    await runGit({
      repositoryPath: dirname(repositoryPath),
      gitArguments: [
        'clone',
        '--bare',
        '--depth=1',
        '--quiet',
        remoteUrl,
        repositoryPath,
      ],
      environment,
    })
  }

  // fetch the base commit and the pull request head
  const pullRequestHeadRef = `+refs/pull/${reference.number}/head:refs/pull-request/${reference.number}`
  await runGit({
    repositoryPath,
    gitArguments: [
      'fetch',
      '--quiet',
      '--depth=1',
      'origin',
      baseSha,
      pullRequestHeadRef,
    ],
    environment,
  })

  // fail when the head moved on since GitHub reported it
  await requireCommit({ repositoryPath, sha: headSha })

  return new GitPullRequestSource({
    repositoryPath,
    baseSha,
    headSha,
    contextLines,
    pullRequestReference: reference,
  })
}

// pass a token to git as a github.com-only header through the environment, never through argv or the config file
function buildGitAuthEnvironment(
  token: string | undefined,
): Record<string, string> {
  if (token === undefined || token === '') {
    return {}
  }
  const basicCredentials = Buffer.from(`x-access-token:${token}`).toString(
    'base64',
  )
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: githubExtraHeaderKey,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basicCredentials}`,
  }
}

interface RequireCommitOptions {
  repositoryPath: string
  sha: string
}

// throw a clear error when a commit is missing from the repository
async function requireCommit({
  repositoryPath,
  sha,
}: RequireCommitOptions): Promise<void> {
  try {
    await runGit({
      repositoryPath,
      gitArguments: ['cat-file', '-e', `${sha}^{commit}`],
    })
  } catch (error) {
    if (!(error instanceof GitCommandError)) {
      throw error
    }
    throw new Error(
      `the pull request head ${sha} was not fetched. The pull request may have been updated, so retry`,
    )
  }
}
