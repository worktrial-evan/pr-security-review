// tests that the git source and the snapshot source return deep-equal changed files for the same trees
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { GitPullRequestSource } from './git-pull-request-source'
import { SnapshotPullRequestSource } from './snapshot-pull-request-source'
import {
  createTwoCommitRepository,
  type TwoCommitRepository,
} from './test-git-repository'

// the fixture trees: one added, modified, deleted, renamed, moved-and-edited and binary file each
const snapshotFixtureDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'pull-request-source',
  'snapshot',
)
const baseDirectory = join(snapshotFixtureDirectory, 'base')
const headDirectory = join(snapshotFixtureDirectory, 'head')

// the repository holding the fixture's base tree and head tree as two commits
let repository: TwoCommitRepository = {
  repositoryPath: '',
  baseSha: '',
  headSha: '',
}

beforeAll(async () => {
  repository = await createTwoCommitRepository({ baseDirectory, headDirectory })
})

afterAll(async () => {
  await rm(repository.repositoryPath, { recursive: true, force: true })
})

describe('git and snapshot sources', () => {
  test.each([0, 1, 3, 5])(
    'return deep-equal changed files with %p lines of context',
    async (contextLines) => {
      // read the same pull request through both sources
      const gitSource = new GitPullRequestSource({
        ...repository,
        contextLines,
      })
      const snapshotSource = new SnapshotPullRequestSource({
        baseDirectory,
        headDirectory,
        contextLines,
      })
      const gitChangedFiles = await gitSource.listChangedFiles()
      const snapshotChangedFiles = await snapshotSource.listChangedFiles()

      // expect every file the fixture changes and identical output, previousPath presence included
      expect(gitChangedFiles).toHaveLength(7)
      expect(snapshotChangedFiles).toStrictEqual(gitChangedFiles)
    },
  )

  test('return the same text for every changed path at base and head', async () => {
    const gitSource = new GitPullRequestSource(repository)
    const snapshotSource = new SnapshotPullRequestSource({
      baseDirectory,
      headDirectory,
    })
    const changedFiles = await gitSource.listChangedFiles()
    const textChangedFiles = changedFiles.filter(
      (changedFile) => !changedFile.isBinary,
    )
    for (const changedFile of textChangedFiles) {
      const basePath = changedFile.previousPath ?? changedFile.path
      expect(await snapshotSource.readFileAtBase(basePath)).toBe(
        await gitSource.readFileAtBase(basePath),
      )
      expect(await snapshotSource.readFileAtHead(changedFile.path)).toBe(
        await gitSource.readFileAtHead(changedFile.path),
      )
    }
  })
})
