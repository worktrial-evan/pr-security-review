// tests cloning a pull request from a local remote with the GitHub API stubbed
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clonePullRequest } from './clone-pull-request'
import { runGit } from './git-command'
import { parsePullRequestReference } from './pull-request-reference'
import {
  createTwoCommitRepository,
  type TwoCommitRepository,
} from './test-git-repository'

// the snapshot fixture trees the remote's two commits hold
const snapshotFixtureDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'pull-request-source',
  'snapshot',
)

// a placeholder token. never a real one
const placeholderToken = 'placeholder-token-for-clone-tests'

// the local remote, its file url and the cache directory each test clones into
let remoteRepository: TwoCommitRepository = {
  repoPath: '',
  baseSha: '',
  headSha: '',
}
let remoteUrl = ''
let cacheDir = ''

// the stubbed fetch, restored after each test
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | null = null

beforeAll(async () => {
  // build the remote with pull request heads 1 and 2 at the head commit
  remoteRepository = await createTwoCommitRepository({
    baseDir: join(snapshotFixtureDirectory, 'base'),
    headDir: join(snapshotFixtureDirectory, 'head'),
  })
  const { repoPath, headSha } = remoteRepository
  await runGit({
    repoPath,
    gitArguments: ['update-ref', 'refs/pull/1/head', headSha],
  })
  await runGit({
    repoPath,
    gitArguments: ['update-ref', 'refs/pull/2/head', headSha],
  })

  // let a shallow fetch ask for the base commit by sha, as GitHub does
  await runGit({
    repoPath,
    gitArguments: ['config', 'uploadpack.allowAnySHA1InWant', 'true'],
  })
  remoteUrl = `file://${repoPath}`
  cacheDir = await mkdtemp(join(tmpdir(), 'clone-pull-request-cache-'))
})

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = null
})

afterAll(async () => {
  await rm(remoteRepository.repoPath, { recursive: true, force: true })
  await rm(cacheDir, { recursive: true, force: true })
})

describe('clonePullRequest', () => {
  test('clones into the cache with no token and lists the pull request files', async () => {
    // answer the API with the remote's shas and clone pull request 1
    stubPullRequestShas(1)
    const reference = parsePullRequestReference('acme/widgets#1')
    const gitSource = await clonePullRequest({ reference, cacheDir, remoteUrl })

    // expect a bare clone in the cache, the shas from the API and the reference in the description
    const repoPath = join(cacheDir, 'acme', 'widgets')
    expect(await Bun.file(join(repoPath, 'HEAD')).exists()).toBe(true)
    const shallowOutput = await runGit({
      repoPath,
      gitArguments: ['rev-parse', '--is-shallow-repository'],
    })
    expect(shallowOutput.trim()).toBe('true')
    expect(await gitSource.describe()).toEqual({
      baseSha: remoteRepository.baseSha,
      headSha: remoteRepository.headSha,
      pullRequestReference: reference,
    })

    // expect the changed files of the fixture, read through the clone
    const changedFiles = await gitSource.listChangedFiles()
    expect(changedFiles).toHaveLength(7)
    expect(fetchSpy?.mock.calls).toHaveLength(1)
  })

  test('reuses the cached clone for a second pull request and keeps the token out of the cache', async () => {
    // mark the cached clone so a fresh clone would be noticed
    const repoPath = join(cacheDir, 'acme', 'widgets')
    await runGit({ repoPath, gitArguments: ['config', 'test.marker', 'kept'] })

    // clone pull request 2 with a token
    stubPullRequestShas(2)
    const reference = parsePullRequestReference('acme/widgets#2')
    const gitSource = await clonePullRequest({
      reference,
      cacheDir,
      remoteUrl,
      token: placeholderToken,
    })

    // expect the token on the API request, the same clone, the new pull request ref and no token on disk
    const requestInit = fetchSpy?.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe(
      `Bearer ${placeholderToken}`,
    )
    const markerOutput = await runGit({
      repoPath,
      gitArguments: ['config', 'test.marker'],
    })
    expect(markerOutput.trim()).toBe('kept')
    const pullRequestRefOutput = await runGit({
      repoPath,
      gitArguments: ['rev-parse', 'refs/pull-request/2'],
    })
    expect(pullRequestRefOutput.trim()).toBe(remoteRepository.headSha)
    const configText = await Bun.file(join(repoPath, 'config')).text()
    expect(configText).not.toContain(placeholderToken)
    expect(configText).not.toContain('extraheader')
    expect((await gitSource.listChangedFiles()).length).toBe(7)
  })
})

// answer the next GitHub API call with the remote's shas for one pull request
function stubPullRequestShas(pullRequestNumber: number): void {
  const pullRequestResponse = Response.json({
    html_url: `https://github.com/acme/widgets/pull/${pullRequestNumber}`,
    title: 'a pull request for the clone tests',
    user: { login: 'clone-test-author' },
    base: { sha: remoteRepository.baseSha },
    head: { sha: remoteRepository.headSha },
  })
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    pullRequestResponse,
  )
}
