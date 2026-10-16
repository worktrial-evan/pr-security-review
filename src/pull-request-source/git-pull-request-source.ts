// reads a pull request from two shas of a local git repository through the git command line
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  ChangedFile,
  ChangedFileStatus,
  PullRequestDescription,
  PullRequestReference,
  PullRequestSource,
} from '@/shared/pull-request-source'
import { createChangedFile, sortFilesByPath } from './changed-file'
import { GitCommandError, runGit } from './git-command'
import { collectAddedLines, parseUnifiedDiffHunks } from './unified-diff'

// the hunk context when the caller sets none, the same as git's default
const defaultContextLines = 3

// diff options that fix the algorithm and turn off color, external diff tools and text conversion
const diffArguments = [
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--diff-algorithm=myers',
  '--minimal',
]

// the file statuses git prints, by their first letter. a type change counts as modified
const changedFileStatusesByLetter: Record<string, ChangedFileStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  T: 'modified',
}

export interface GitPullRequestSourceOptions {
  repoPath: string
  baseSha: string
  headSha: string
  contextLines?: number
  pullRequestReference?: PullRequestReference
}

// one entry of git's name-status output
interface NameStatusEntry {
  path: string
  status: ChangedFileStatus
  previousPath?: string
}

// a pull request read from two shas of a local repository
export class GitPullRequestSource implements PullRequestSource {
  private readonly options: GitPullRequestSourceOptions
  private readonly contextLines: number
  private headCheckoutPromise: Promise<string> | null = null

  constructor(options: GitPullRequestSourceOptions) {
    this.options = options
    this.contextLines = options.contextLines ?? defaultContextLines
  }

  /** Describes the two shas and the pull request reference when there is one. */
  async describe(): Promise<PullRequestDescription> {
    // add the reference only when the source has one
    const { baseSha, headSha, pullRequestReference } = this.options
    const referenceFields =
      pullRequestReference === undefined ? {} : { pullRequestReference }
    return { baseSha, headSha, ...referenceFields }
  }

  /** Lists every file that differs between the shas, sorted by path, with hunks and added lines. */
  async listChangedFiles(): Promise<ChangedFile[]> {
    // read the changed paths and which of them are binary
    const nameStatusEntries = await this.readNameStatusEntries()
    const binaryPaths = await this.readBinaryPaths()

    // diff each path into the changed file shape
    const changedFiles: ChangedFile[] = []
    for (const nameStatusEntry of nameStatusEntries) {
      const changedFile = await this.toChangedFile(nameStatusEntry, binaryPaths)
      const isModeOnlyChange =
        changedFile.status === 'modified' &&
        !changedFile.isBinary &&
        changedFile.hunks.length === 0
      if (!isModeOnlyChange) {
        changedFiles.push(changedFile)
      }
    }
    return sortFilesByPath(changedFiles)
  }

  /** Reads a file's text at the base sha, or null when it is not there. */
  async readFileAtBase(path: string): Promise<string | null> {
    return this.readFileAt(this.options.baseSha, path)
  }

  /** Reads a file's text at the head sha, or null when it is not there. */
  async readFileAtHead(path: string): Promise<string | null> {
    return this.readFileAt(this.options.headSha, path)
  }

  /** Checks out the head sha into a temporary git worktree once and returns its directory. */
  async checkoutHead(): Promise<string> {
    this.headCheckoutPromise ??= this.addHeadWorktree()
    return this.headCheckoutPromise
  }

  /** Removes the head worktree when one was checked out. */
  async dispose(): Promise<void> {
    if (this.headCheckoutPromise === null) {
      return
    }
    // wait for the checkout to finish, then forget it
    const worktreePath = await this.headCheckoutPromise
    this.headCheckoutPromise = null

    // remove the worktree, then anything git left behind
    await this.git(['worktree', 'remove', '--force', worktreePath]).catch(
      () => '',
    )
    await rm(worktreePath, { recursive: true, force: true })
    await this.git(['worktree', 'prune'])
  }

  // run git in the repository
  private git(gitArguments: string[]): Promise<string> {
    return runGit({ repoPath: this.options.repoPath, gitArguments })
  }

  // read the changed paths with their status. renames are exact renames only
  private async readNameStatusEntries(): Promise<NameStatusEntry[]> {
    const { baseSha, headSha } = this.options
    const nameStatusOutput = await this.git([
      ...diffArguments,
      '--name-status',
      '-z',
      '--find-renames=100%',
      baseSha,
      headSha,
    ])
    return parseNameStatus(nameStatusOutput)
  }

  // read the paths git counts as binary, where numstat prints - for both counts
  private async readBinaryPaths(): Promise<Set<string>> {
    const { baseSha, headSha } = this.options
    const numstatOutput = await this.git([
      ...diffArguments,
      '--numstat',
      '-z',
      '--no-renames',
      baseSha,
      headSha,
    ])
    const numstatRecords = numstatOutput
      .split('\0')
      .filter((record) => record !== '')
    const binaryRecords = numstatRecords.filter((record) =>
      record.startsWith('-\t-\t'),
    )
    return new Set(binaryRecords.map((record) => record.slice('-\t-\t'.length)))
  }

  // build one changed file. a binary file or an exact rename has no hunks
  private async toChangedFile(
    nameStatusEntry: NameStatusEntry,
    binaryPaths: Set<string>,
  ): Promise<ChangedFile> {
    // skip the diff for a binary file or an exact rename
    const { path, status, previousPath } = nameStatusEntry
    const isBinary =
      binaryPaths.has(path) ||
      (previousPath !== undefined && binaryPaths.has(previousPath))
    if (isBinary || status === 'renamed') {
      return createChangedFile({
        path,
        status,
        previousPath,
        hunks: [],
        addedLines: [],
        isBinary,
      })
    }

    // take added lines from a diff without context and hunks from a diff with context
    const addedLineHunks = parseUnifiedDiffHunks(await this.diffFile(path, 0))
    const hunks = parseUnifiedDiffHunks(
      await this.diffFile(path, this.contextLines),
    )
    const addedLines = collectAddedLines(addedLineHunks)
    return createChangedFile({
      path,
      status,
      previousPath,
      hunks,
      addedLines,
      isBinary,
    })
  }

  // diff one path between the shas with the given context
  private diffFile(path: string, contextLines: number): Promise<string> {
    const { baseSha, headSha } = this.options
    return this.git([
      ...diffArguments,
      `--unified=${contextLines}`,
      baseSha,
      headSha,
      '--',
      path,
    ])
  }

  // read a file's text at a sha, or null when git has no such file there
  private async readFileAt(sha: string, path: string): Promise<string | null> {
    try {
      return await this.git(['cat-file', 'blob', `${sha}:${path}`])
    } catch (error) {
      if (error instanceof GitCommandError) {
        return null
      }
      throw error
    }
  }

  // add a detached worktree at the head sha in a new temporary directory
  private async addHeadWorktree(): Promise<string> {
    const worktreePath = await mkdtemp(join(tmpdir(), 'pull-request-head-'))
    await this.git([
      'worktree',
      'add',
      '--detach',
      worktreePath,
      this.options.headSha,
    ])
    return worktreePath
  }
}

// parse -z name-status output: a status then one path, or two paths for a rename or copy
function parseNameStatus(nameStatusOutput: string): NameStatusEntry[] {
  const tokens = nameStatusOutput.split('\0')
  const nameStatusEntries: NameStatusEntry[] = []
  let tokenIndex = 0
  while (tokenIndex < tokens.length) {
    const statusToken = tokens[tokenIndex] ?? ''
    tokenIndex += 1
    if (statusToken === '') {
      continue
    }

    // read the status letter and the paths that follow it
    const status = changedFileStatusesByLetter[statusToken[0] ?? '']
    if (status === undefined) {
      throw new Error(
        `git reported an unsupported file status '${statusToken}'`,
      )
    }
    if (status === 'renamed') {
      const previousPath = tokens[tokenIndex] ?? ''
      const path = tokens[tokenIndex + 1] ?? ''
      tokenIndex += 2
      nameStatusEntries.push({ path, status, previousPath })
      continue
    }
    nameStatusEntries.push({ path: tokens[tokenIndex] ?? '', status })
    tokenIndex += 1
  }
  return nameStatusEntries
}
