// reads a pull request from two directory snapshots, diffing the trees into the same changed files git would report
import { sep as pathSeparator, resolve } from 'node:path'
import type {
  ChangedFile,
  ChangedFileStatus,
  PullRequestDescription,
  PullRequestSource,
} from '@/shared/pull-request-source'
import {
  comparePaths,
  createChangedFile,
  sortChangedFiles,
} from './changed-file'
import { buildLineDiffHunks } from './line-diff'
import { collectAddedLines } from './unified-diff'

// the hunk context when the caller sets none, the same as git's default
const defaultContextLines = 3

// how many leading bytes git scans for a NUL byte to call a file binary
const binaryScanByteCount = 8000

// every file below a tree root, at any depth, dotfiles included
const allFilesGlob = new Bun.Glob('**/*')

export interface SnapshotPullRequestSourceOptions {
  baseDir: string
  headDir: string
  contextLines?: number
}

// one changed path with the bytes on each side. null means the side has no such file
interface FileChange {
  path: string
  status: ChangedFileStatus
  previousPath?: string
  baseBytes: Uint8Array | null
  headBytes: Uint8Array | null
}

// a pull request read from a base directory and a head directory
export class SnapshotPullRequestSource implements PullRequestSource {
  private readonly baseDir: string
  private readonly headDir: string
  private readonly contextLines: number

  constructor({
    baseDir,
    headDir,
    contextLines = defaultContextLines,
  }: SnapshotPullRequestSourceOptions) {
    this.baseDir = resolve(baseDir)
    this.headDir = resolve(headDir)
    this.contextLines = contextLines
  }

  /** Describes the snapshot with each directory path standing in for a sha. */
  async describe(): Promise<PullRequestDescription> {
    return {
      baseSha: `snapshot:${this.baseDir}`,
      headSha: `snapshot:${this.headDir}`,
    }
  }

  /** Lists every file that differs between the trees, sorted by path. */
  async listChangedFiles(): Promise<ChangedFile[]> {
    // read both trees into path to bytes maps
    const baseFiles = await readTree(this.baseDir)
    const headFiles = await readTree(this.headDir)

    // find the changes, then pair identical deletions and additions into renames
    const fileChanges = findFileChanges(baseFiles, headFiles)
    const pairedFileChanges = pairExactRenames(fileChanges)

    // diff each change into the changed file shape, sorted by path
    const changedFiles = pairedFileChanges.map((fileChange) =>
      toChangedFile(fileChange, this.contextLines),
    )
    return sortChangedFiles(changedFiles)
  }

  /** Reads a file's text in the base tree, or null when it is not there. */
  async readFileAtBase(path: string): Promise<string | null> {
    return readTreeFile(this.baseDir, path)
  }

  /** Reads a file's text in the head tree, or null when it is not there. */
  async readFileAtHead(path: string): Promise<string | null> {
    return readTreeFile(this.headDir, path)
  }

  /** Returns the head directory, which already holds the head files. */
  async checkoutHead(): Promise<string> {
    return this.headDir
  }

  /** Does nothing, since a snapshot creates nothing to clean up. */
  async dispose(): Promise<void> {}
}

// read every file under a root into a map of relative path to bytes
async function readTree(root: string): Promise<Map<string, Uint8Array>> {
  const relativePaths = await Array.fromAsync(
    allFilesGlob.scan({ cwd: root, onlyFiles: true, dot: true }),
  )
  const treeFiles = new Map<string, Uint8Array>()
  for (const relativePath of relativePaths) {
    const portablePath = relativePath.split(pathSeparator).join('/')
    treeFiles.set(
      portablePath,
      await Bun.file(resolve(root, relativePath)).bytes(),
    )
  }
  return treeFiles
}

// list the added, modified and deleted paths between two trees
function findFileChanges(
  baseFiles: Map<string, Uint8Array>,
  headFiles: Map<string, Uint8Array>,
): FileChange[] {
  const fileChanges: FileChange[] = []

  // a path in the base is deleted when the head lacks it and modified when its bytes differ
  for (const [path, baseBytes] of baseFiles) {
    const headBytes = headFiles.get(path) ?? null
    if (headBytes === null) {
      fileChanges.push({ path, status: 'deleted', baseBytes, headBytes })
    } else if (!Buffer.from(baseBytes).equals(headBytes)) {
      fileChanges.push({ path, status: 'modified', baseBytes, headBytes })
    }
  }

  // a path only in the head is added
  for (const [path, headBytes] of headFiles) {
    if (!baseFiles.has(path)) {
      fileChanges.push({ path, status: 'added', baseBytes: null, headBytes })
    }
  }
  return fileChanges
}

// pair each deleted file with an added file of identical bytes, in sorted path order
function pairExactRenames(fileChanges: FileChange[]): FileChange[] {
  // split out the candidates on each side, sorted so pairing is stable
  const deletedChanges = fileChanges.filter(
    (fileChange) => fileChange.status === 'deleted',
  )
  const addedChanges = fileChanges.filter(
    (fileChange) => fileChange.status === 'added',
  )
  deletedChanges.sort((first, second) => comparePaths(first.path, second.path))
  addedChanges.sort((first, second) => comparePaths(first.path, second.path))

  // replace each matched pair with one renamed change at the new path
  const pairedPaths = new Set<string>()
  const renamedChanges: FileChange[] = []
  for (const deletedChange of deletedChanges) {
    const matchingAddedChange = addedChanges.find(
      (addedChange) =>
        !pairedPaths.has(addedChange.path) &&
        Buffer.from(addedChange.headBytes ?? []).equals(
          deletedChange.baseBytes ?? new Uint8Array(),
        ),
    )
    if (matchingAddedChange === undefined) {
      continue
    }
    pairedPaths.add(deletedChange.path).add(matchingAddedChange.path)
    renamedChanges.push({
      path: matchingAddedChange.path,
      status: 'renamed',
      previousPath: deletedChange.path,
      baseBytes: deletedChange.baseBytes,
      headBytes: matchingAddedChange.headBytes,
    })
  }

  // keep every change that was not paired
  const unpairedChanges = fileChanges.filter(
    (fileChange) => !pairedPaths.has(fileChange.path),
  )
  return [...unpairedChanges, ...renamedChanges]
}

// diff one change into a changed file. a binary file has no hunks and no added lines
function toChangedFile(
  fileChange: FileChange,
  contextLines: number,
): ChangedFile {
  // skip the diff for a binary file
  const { path, status, previousPath, baseBytes, headBytes } = fileChange
  const isBinary = isBinaryContent(baseBytes) || isBinaryContent(headBytes)
  if (isBinary) {
    return createChangedFile({
      path,
      status,
      previousPath,
      hunks: [],
      addedLines: [],
      isBinary,
    })
  }

  // diff the two texts and collect the added lines
  const hunks = buildLineDiffHunks({
    baseText: decodeText(baseBytes),
    headText: decodeText(headBytes),
    contextLines,
  })
  const addedLines = collectAddedLines(hunks)
  return createChangedFile({
    path,
    status,
    previousPath,
    hunks,
    addedLines,
    isBinary,
  })
}

// tell whether the leading bytes hold a NUL byte, git's binary test
function isBinaryContent(bytes: Uint8Array | null): boolean {
  if (bytes === null) {
    return false
  }
  return bytes.subarray(0, binaryScanByteCount).includes(0)
}

// decode bytes as utf-8, with a missing side as empty text
function decodeText(bytes: Uint8Array | null): string {
  return bytes === null ? '' : new TextDecoder().decode(bytes)
}

// read a file's text below a root, or null when it is missing or the path leaves the root
async function readTreeFile(
  root: string,
  path: string,
): Promise<string | null> {
  const filePath = resolve(root, path)
  const isInsideRoot = filePath.startsWith(`${root}${pathSeparator}`)
  if (!isInsideRoot) {
    return null
  }
  const file = Bun.file(filePath)
  if (!(await file.exists())) {
    return null
  }
  return file.text()
}
