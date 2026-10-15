// a PullRequestSource over two directory trees, diffed through git diff --no-index
import { join, resolve } from 'node:path'
import type {
  ChangedFile,
  PullRequestDescription,
  PullRequestSource,
} from '@/shared/pull-request-source'
import { cleanGitEnvironment } from './git-environment'
import { parseUnifiedDiff } from './unified-diff'

// the two trees a snapshot compares and the shas they stand in for
export interface SnapshotPullRequestSourceOptions {
  baseDirectory: string
  headDirectory: string
  baseSha?: string
  headSha?: string
}

/**
 * Reads a pull request from a base tree and a head tree on disk.
 */
export class SnapshotPullRequestSource implements PullRequestSource {
  // the absolute paths of the two trees
  private readonly baseDirectory: string
  private readonly headDirectory: string

  // the shas describe() reports
  private readonly baseSha: string
  private readonly headSha: string

  constructor({
    baseDirectory,
    headDirectory,
    baseSha = 'base',
    headSha = 'head',
  }: SnapshotPullRequestSourceOptions) {
    this.baseDirectory = resolve(baseDirectory)
    this.headDirectory = resolve(headDirectory)
    this.baseSha = baseSha
    this.headSha = headSha
  }

  /**
   * Describes the snapshot by the shas it stands in for.
   */
  async describe(): Promise<PullRequestDescription> {
    return { baseSha: this.baseSha, headSha: this.headSha }
  }

  /**
   * Lists the files that differ between the base tree and the head tree.
   */
  async listChangedFiles(): Promise<ChangedFile[]> {
    // diff the two trees. git exits 1 when they differ and 0 when they are equal
    const diffResult =
      await Bun.$`git diff --no-index --unified=0 --no-color ${this.baseDirectory} ${this.headDirectory}`
        .env(cleanGitEnvironment())
        .nothrow()
        .quiet()
    if (diffResult.exitCode > 1) {
      throw new Error(
        `git diff --no-index exited with ${diffResult.exitCode}: ${diffResult.stderr.toString().trim()}`,
      )
    }

    // parse the diff and make every path relative to its tree
    const changedFiles = parseUnifiedDiff(diffResult.stdout.toString())
    return changedFiles.map((changedFile) =>
      this.stripTreeDirectories(changedFile),
    )
  }

  /**
   * Reads a file from the base tree, or null when it is not there.
   */
  async readFileAtBase(path: string): Promise<string | null> {
    return readFileFromTree(join(this.baseDirectory, path))
  }

  /**
   * Reads a file from the head tree, or null when it is not there.
   */
  async readFileAtHead(path: string): Promise<string | null> {
    return readFileFromTree(join(this.headDirectory, path))
  }

  /**
   * Returns the head tree, which is already checked out on disk.
   */
  async checkoutHead(): Promise<string> {
    return this.headDirectory
  }

  /**
   * Releases nothing, as the trees are owned by the case.
   */
  async dispose(): Promise<void> {}

  // remove the tree directories git prints in front of every path
  private stripTreeDirectories(changedFile: ChangedFile): ChangedFile {
    // git drops the leading slash of an absolute path, so the prefixes do too
    const treePrefixes = [
      `${this.headDirectory.replace(/^\/+/, '')}/`,
      `${this.baseDirectory.replace(/^\/+/, '')}/`,
    ]

    // strip the prefix from the path and from the previous path of a rename
    const strippedChangedFile: ChangedFile = {
      ...changedFile,
      path: stripTreePrefix({ path: changedFile.path, treePrefixes }),
    }
    if (changedFile.previousPath !== undefined) {
      strippedChangedFile.previousPath = stripTreePrefix({
        path: changedFile.previousPath,
        treePrefixes,
      })
    }
    return strippedChangedFile
  }
}

// a path and the tree prefixes to remove from it
interface StripTreePrefixOptions {
  path: string
  treePrefixes: string[]
}

// remove the first tree prefix the path starts with
function stripTreePrefix({
  path,
  treePrefixes,
}: StripTreePrefixOptions): string {
  for (const treePrefix of treePrefixes) {
    if (path.startsWith(treePrefix)) {
      return path.slice(treePrefix.length)
    }
  }
  return path
}

// read a file's text, or null when the file is missing
async function readFileFromTree(filePath: string): Promise<string | null> {
  const treeFile = Bun.file(filePath)
  if (!(await treeFile.exists())) {
    return null
  }
  return treeFile.text()
}
