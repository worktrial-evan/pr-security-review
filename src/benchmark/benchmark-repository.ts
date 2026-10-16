// clones a benchmark case's repository once into the shared cache and opens the pull-request-source module's git source over its two shas, with a network failure classified as an offline skip
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { GitCommandError, runGit } from '@/pull-request-source/git-command'
import { GitPullRequestSource } from '@/pull-request-source/git-pull-request-source'
import { resolveCacheDirectory } from '@/shared/cache-directory'

// the environment variable that forbids any network access
export const offlineEnvironmentVariable = 'PULL_REQUEST_REVIEW_OFFLINE'

// the directory under the cache that holds every clone
const clonesDirectoryName = 'benchmark-repositories'

// the stderr fragments that mean git could not resolve or connect to the host. a refused url with any other error stays an error
const networkFailurePatterns = [
  /could not resolve host/i,
  /failed to connect/i,
  /couldn't connect to server/i,
  /connection (refused|reset|timed out)/i,
  /network is unreachable/i,
  /timed out/i,
]

// what open needs: the repository, the two shas and where to keep the clone
export interface OpenBenchmarkRepositoryOptions {
  repositoryUrl: string
  baseSha: string
  headSha: string
  cacheDirectory?: string
}

/**
 * Clones the repository into the cache on first use and returns the module's git source over the two shas.
 */
export async function openBenchmarkRepository({
  repositoryUrl,
  baseSha,
  headSha,
  cacheDirectory = resolveCacheDirectory(),
}: OpenBenchmarkRepositoryOptions): Promise<GitPullRequestSource> {
  // place the clone by host, owner and repository under the cache
  const cloneDirectory = join(
    cacheDirectory,
    clonesDirectoryName,
    ...resolveClonePathSegments(repositoryUrl),
  )

  // clone once and make sure both shas are in the clone
  await ensureClone({ repositoryUrl, cloneDirectory, cacheDirectory })
  await ensureShasPresent({
    repositoryUrl,
    cloneDirectory,
    shas: [baseSha, headSha],
  })

  return new GitPullRequestSource({
    repositoryPath: cloneDirectory,
    baseSha,
    headSha,
  })
}

// what a failed clone says about the repository it could not reach
interface OfflineCloneErrorOptions {
  repositoryUrl: string
  reason: string
}

/**
 * Signals that a repository could not be cloned or fetched because the network is unavailable.
 */
export class OfflineCloneError extends Error {
  // the repository that could not be reached
  readonly repositoryUrl: string

  constructor({ repositoryUrl, reason }: OfflineCloneErrorOptions) {
    super(`cannot reach ${repositoryUrl}: ${reason}`)
    this.name = 'OfflineCloneError'
    this.repositoryUrl = repositoryUrl
  }
}

/**
 * Reports whether the offline environment variable forbids network access.
 */
export function isGitSourceOffline(): boolean {
  const offlineValue = process.env[offlineEnvironmentVariable]
  return offlineValue !== undefined && offlineValue !== ''
}

// the path segments under benchmark-repositories a repository url clones into
function resolveClonePathSegments(repositoryUrl: string): string[] {
  // read the host and the path from the url
  const url = new URL(repositoryUrl)
  const pathSegments = url.pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => segment.replace(/\.git$/, ''))

  // keep the last two path segments, which are owner and repository on a forge
  const lastTwoSegments = pathSegments.slice(-2)

  // a file url has no host, so its clones live under local
  if (url.protocol === 'file:' || url.hostname === '') {
    return ['local', ...lastTwoSegments]
  }
  return [url.hostname, ...lastTwoSegments]
}

// the repository, the directory ensureClone fills and the cache directory it sits under
interface EnsureCloneOptions {
  repositoryUrl: string
  cloneDirectory: string
  cacheDirectory: string
}

// clone the repository without a checkout, or reuse the clone already there
async function ensureClone({
  repositoryUrl,
  cloneDirectory,
  cacheDirectory,
}: EnsureCloneOptions): Promise<void> {
  // reuse an existing clone
  if (await Bun.file(join(cloneDirectory, '.git', 'HEAD')).exists()) {
    return
  }

  // refuse to go on the network when the offline flag is set
  if (isGitSourceOffline()) {
    throw new OfflineCloneError({
      repositoryUrl,
      reason: `${offlineEnvironmentVariable} is set`,
    })
  }

  // clone without checking any file out, running git in the parent directory
  const parentDirectory = dirname(cloneDirectory)
  await mkdir(parentDirectory, { recursive: true })
  const cloneStderr = await readGitFailure(
    runGit({
      repositoryPath: parentDirectory,
      gitArguments: [
        'clone',
        '--no-checkout',
        '--quiet',
        repositoryUrl,
        cloneDirectory,
      ],
    }),
  )
  if (cloneStderr === null) {
    return
  }

  // drop a half-made clone and the empty directories made for it under the cache, then classify the failure
  await rm(cloneDirectory, { recursive: true, force: true })
  await removeEmptyParentDirectories({
    directory: parentDirectory,
    stopDirectory: cacheDirectory,
  })
  if (isNetworkFailure(cloneStderr)) {
    throw new OfflineCloneError({ repositoryUrl, reason: cloneStderr })
  }
  throw new Error(`git clone of ${repositoryUrl} failed: ${cloneStderr}`)
}

// the directory to start removing at and the one that is kept whatever it holds
interface RemoveEmptyParentDirectoriesOptions {
  directory: string
  stopDirectory: string
}

// remove the directory and each parent above it while they are empty, keeping the stop directory
async function removeEmptyParentDirectories({
  directory,
  stopDirectory,
}: RemoveEmptyParentDirectoriesOptions): Promise<void> {
  // walk up until the stop directory, the filesystem root or a directory that holds something
  let currentDirectory = directory
  while (
    currentDirectory !== stopDirectory &&
    dirname(currentDirectory) !== currentDirectory
  ) {
    const entries = await readdir(currentDirectory).catch(() => null)
    if (entries === null || entries.length > 0) {
      return
    }
    await rm(currentDirectory, { recursive: true, force: true })
    currentDirectory = dirname(currentDirectory)
  }
}

// the clone and the shas ensureShasPresent checks
interface EnsureShasPresentOptions {
  repositoryUrl: string
  cloneDirectory: string
  shas: string[]
}

// fetch when a sha is missing from the clone, and fail when it is still missing afterwards
async function ensureShasPresent({
  repositoryUrl,
  cloneDirectory,
  shas,
}: EnsureShasPresentOptions): Promise<void> {
  // skip the fetch when every sha is already in the clone
  const missingShas = await listMissingShas({ cloneDirectory, shas })
  if (missingShas.length === 0) {
    return
  }

  // refuse to fetch when the offline flag is set
  if (isGitSourceOffline()) {
    throw new OfflineCloneError({
      repositoryUrl,
      reason: `${offlineEnvironmentVariable} is set and ${missingShas.join(', ')} is not in the clone`,
    })
  }

  // fetch everything the remote has
  const fetchStderr = await readGitFailure(
    runGit({
      repositoryPath: cloneDirectory,
      gitArguments: ['fetch', '--quiet', 'origin'],
    }),
  )
  if (fetchStderr !== null) {
    if (isNetworkFailure(fetchStderr)) {
      throw new OfflineCloneError({ repositoryUrl, reason: fetchStderr })
    }
    throw new Error(`git fetch of ${repositoryUrl} failed: ${fetchStderr}`)
  }

  // name the shas the remote does not have either
  const stillMissingShas = await listMissingShas({ cloneDirectory, shas })
  if (stillMissingShas.length > 0) {
    throw new Error(
      `${repositoryUrl} does not hold ${stillMissingShas.join(', ')} after a fetch`,
    )
  }
}

// the clone and the shas listMissingShas looks for
interface ListMissingShasOptions {
  cloneDirectory: string
  shas: string[]
}

// the shas the clone has no commit for
async function listMissingShas({
  cloneDirectory,
  shas,
}: ListMissingShasOptions): Promise<string[]> {
  // ask git for each sha as a commit and keep the ones it does not know
  const missingShas: string[] = []
  for (const sha of shas) {
    const catFileStderr = await readGitFailure(
      runGit({
        repositoryPath: cloneDirectory,
        gitArguments: ['cat-file', '-e', `${sha}^{commit}`],
      }),
    )
    if (catFileStderr !== null) {
      missingShas.push(sha)
    }
  }
  return missingShas
}

// wait for a git command and return its stderr when it failed, or null when it succeeded
async function readGitFailure(gitRun: Promise<string>): Promise<string | null> {
  try {
    await gitRun
    return null
  } catch (error) {
    if (error instanceof GitCommandError) {
      return error.stderr.trim()
    }
    throw error
  }
}

// whether a git failure message names a network problem
function isNetworkFailure(stderr: string): boolean {
  return networkFailurePatterns.some((pattern) => pattern.test(stderr))
}
