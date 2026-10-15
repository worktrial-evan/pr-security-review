// a PullRequestSource over two shas of a git repository cloned once into the shared cache
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type {
  ChangedFile,
  PullRequestDescription,
  PullRequestSource,
} from '@/shared/pull-request-source'
import { cleanGitEnvironment } from './git-environment'
import { parseUnifiedDiff } from './unified-diff'

// the environment variable that forbids any network access
export const offlineEnvironmentVariable = 'PULL_REQUEST_REVIEW_OFFLINE'

// the directory under the cache that holds every clone
const clonesDirectoryName = 'benchmark-repos'

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
export interface OpenGitPullRequestSourceOptions {
  repoUrl: string
  baseSha: string
  headSha: string
  cacheDirectory?: string
}

// what the constructor receives once the clone is ready
interface GitPullRequestSourceOptions {
  cloneDirectory: string
  baseSha: string
  headSha: string
}

/**
 * Reads a pull request from two shas of a repository cloned under the cache directory.
 */
export class GitPullRequestSource implements PullRequestSource {
  // the clone the shas are read from
  private readonly cloneDirectory: string

  // the two shas the pull request spans
  private readonly baseSha: string
  private readonly headSha: string

  // the detached worktree checkoutHead made, until dispose removes it
  private worktreeDirectory: string | null = null

  private constructor({
    cloneDirectory,
    baseSha,
    headSha,
  }: GitPullRequestSourceOptions) {
    this.cloneDirectory = cloneDirectory
    this.baseSha = baseSha
    this.headSha = headSha
  }

  /**
   * Opens a source over two shas, cloning the repository into the cache on first use.
   */
  static async open({
    repoUrl,
    baseSha,
    headSha,
    cacheDirectory = resolveCacheDirectory(),
  }: OpenGitPullRequestSourceOptions): Promise<GitPullRequestSource> {
    // place the clone by host, owner and repository under the cache
    const clonesDirectory = join(cacheDirectory, clonesDirectoryName)
    const cloneDirectory = join(
      clonesDirectory,
      ...resolveClonePathSegments(repoUrl),
    )

    // clone once and make sure both shas are in the clone
    await ensureClone({ repoUrl, cloneDirectory, cacheDirectory })
    await ensureShasPresent({
      repoUrl,
      cloneDirectory,
      shas: [baseSha, headSha],
    })

    return new GitPullRequestSource({ cloneDirectory, baseSha, headSha })
  }

  /**
   * Describes the pull request by its two shas.
   */
  async describe(): Promise<PullRequestDescription> {
    return { baseSha: this.baseSha, headSha: this.headSha }
  }

  /**
   * Lists the files that differ between the base sha and the head sha.
   */
  async listChangedFiles(): Promise<ChangedFile[]> {
    // diff the two commits with no context lines
    const diffResult = await runGit([
      '-C',
      this.cloneDirectory,
      'diff',
      '--unified=0',
      '--no-color',
      this.baseSha,
      this.headSha,
    ])
    if (diffResult.exitCode !== 0) {
      throw new Error(
        `git diff ${this.baseSha} ${this.headSha} exited with ${diffResult.exitCode}: ${diffResult.stderr.toString().trim()}`,
      )
    }

    return parseUnifiedDiff(diffResult.stdout.toString())
  }

  /**
   * Reads a file at the base sha, or null when the sha does not hold it.
   */
  async readFileAtBase(path: string): Promise<string | null> {
    return this.showFile({ sha: this.baseSha, path })
  }

  /**
   * Reads a file at the head sha, or null when the sha does not hold it.
   */
  async readFileAtHead(path: string): Promise<string | null> {
    return this.showFile({ sha: this.headSha, path })
  }

  /**
   * Checks the head sha out into a detached worktree under a temporary directory.
   */
  async checkoutHead(): Promise<string> {
    // reuse the worktree when it is already there
    if (this.worktreeDirectory !== null) {
      return this.worktreeDirectory
    }

    // add a detached worktree at the head sha
    const worktreeDirectory = await mkdtemp(
      join(tmpdir(), 'pull-request-review-head-'),
    )
    const worktreeResult = await runGit([
      '-C',
      this.cloneDirectory,
      'worktree',
      'add',
      '--detach',
      worktreeDirectory,
      this.headSha,
    ])
    if (worktreeResult.exitCode !== 0) {
      await rm(worktreeDirectory, { recursive: true, force: true })
      throw new Error(
        `git worktree add for ${this.headSha} exited with ${worktreeResult.exitCode}: ${worktreeResult.stderr.toString().trim()}`,
      )
    }

    this.worktreeDirectory = worktreeDirectory
    return worktreeDirectory
  }

  /**
   * Removes the worktree checkoutHead made, if any.
   */
  async dispose(): Promise<void> {
    if (this.worktreeDirectory === null) {
      return
    }

    // unregister the worktree from the clone and delete its directory
    await runGit([
      '-C',
      this.cloneDirectory,
      'worktree',
      'remove',
      '--force',
      this.worktreeDirectory,
    ])
    await rm(this.worktreeDirectory, { recursive: true, force: true })
    this.worktreeDirectory = null
  }

  // read a file at a sha through git show. null when git exits non-zero
  private async showFile({
    sha,
    path,
  }: ShowFileOptions): Promise<string | null> {
    const showResult = await runGit([
      '-C',
      this.cloneDirectory,
      'show',
      `${sha}:${path}`,
    ])
    if (showResult.exitCode !== 0) {
      return null
    }
    return showResult.stdout.toString()
  }
}

// the sha and the path showFile reads
interface ShowFileOptions {
  sha: string
  path: string
}

// what a failed clone says about the repository it could not reach
interface OfflineCloneErrorOptions {
  repoUrl: string
  reason: string
}

/**
 * Signals that a repository could not be cloned or fetched because the network is unavailable.
 */
export class OfflineCloneError extends Error {
  // the repository that could not be reached
  readonly repoUrl: string

  constructor({ repoUrl, reason }: OfflineCloneErrorOptions) {
    super(`cannot reach ${repoUrl}: ${reason}`)
    this.name = 'OfflineCloneError'
    this.repoUrl = repoUrl
  }
}

/**
 * Reports whether the offline environment variable forbids network access.
 */
export function isGitSourceOffline(): boolean {
  const offlineValue = process.env[offlineEnvironmentVariable]
  return offlineValue !== undefined && offlineValue !== ''
}

// the path segments under benchmark-repos a repository url clones into
function resolveClonePathSegments(repoUrl: string): string[] {
  // read the host and the path from the url
  const url = new URL(repoUrl)
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
  repoUrl: string
  cloneDirectory: string
  cacheDirectory: string
}

// clone the repository without a checkout, or reuse the clone already there
async function ensureClone({
  repoUrl,
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
      repoUrl,
      reason: `${offlineEnvironmentVariable} is set`,
    })
  }

  // clone without checking any file out
  await mkdir(dirname(cloneDirectory), { recursive: true })
  const cloneResult = await runGit([
    'clone',
    '--no-checkout',
    '--quiet',
    repoUrl,
    cloneDirectory,
  ])
  if (cloneResult.exitCode === 0) {
    return
  }

  // drop a half-made clone and the empty directories made for it under the cache, then classify the failure
  await rm(cloneDirectory, { recursive: true, force: true })
  await removeEmptyParentDirectories({
    directory: dirname(cloneDirectory),
    stopDirectory: cacheDirectory,
  })
  const cloneStderr = cloneResult.stderr.toString().trim()
  if (isNetworkFailure(cloneStderr)) {
    throw new OfflineCloneError({ repoUrl, reason: cloneStderr })
  }
  throw new Error(`git clone of ${repoUrl} failed: ${cloneStderr}`)
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
  repoUrl: string
  cloneDirectory: string
  shas: string[]
}

// fetch when a sha is missing from the clone, and fail when it is still missing afterwards
async function ensureShasPresent({
  repoUrl,
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
      repoUrl,
      reason: `${offlineEnvironmentVariable} is set and ${missingShas.join(', ')} is not in the clone`,
    })
  }

  // fetch everything the remote has
  const fetchResult = await runGit([
    '-C',
    cloneDirectory,
    'fetch',
    '--quiet',
    'origin',
  ])
  if (fetchResult.exitCode !== 0) {
    const fetchStderr = fetchResult.stderr.toString().trim()
    if (isNetworkFailure(fetchStderr)) {
      throw new OfflineCloneError({ repoUrl, reason: fetchStderr })
    }
    throw new Error(`git fetch of ${repoUrl} failed: ${fetchStderr}`)
  }

  // name the shas the remote does not have either
  const stillMissingShas = await listMissingShas({ cloneDirectory, shas })
  if (stillMissingShas.length > 0) {
    throw new Error(
      `${repoUrl} does not hold ${stillMissingShas.join(', ')} after a fetch`,
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
    const catFileResult = await runGit([
      '-C',
      cloneDirectory,
      'cat-file',
      '-e',
      `${sha}^{commit}`,
    ])
    if (catFileResult.exitCode !== 0) {
      missingShas.push(sha)
    }
  }
  return missingShas
}

// whether a git failure message names a network problem
function isNetworkFailure(stderr: string): boolean {
  return networkFailurePatterns.some((pattern) => pattern.test(stderr))
}

// the output of one git command
interface GitCommandResult {
  exitCode: number
  stdout: Buffer
  stderr: Buffer
}

// run git with the given arguments, never throwing and never prompting for credentials
async function runGit(gitArguments: string[]): Promise<GitCommandResult> {
  // run git outside any hook environment, keeping its exit code and output
  const gitResult = await Bun.$`git ${gitArguments}`
    .env(cleanGitEnvironment())
    .nothrow()
    .quiet()
  return {
    exitCode: gitResult.exitCode,
    stdout: gitResult.stdout,
    stderr: gitResult.stderr,
  }
}
