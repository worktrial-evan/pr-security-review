// tests fetching pull request shas against recorded GitHub API responses with fetch stubbed
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { join } from 'node:path'
import {
  fetchPullRequestShas,
  GitHubRateLimitError,
  GitHubRequestError,
} from './github-api'
import { parsePullRequestReference } from './pull-request-reference'

// the recorded GitHub responses
const githubFixturesDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'pull-request-source',
  'github',
)
const pullRequestFixturePath = join(
  githubFixturesDirectory,
  'octocat-hello-world-pull-1.json',
)
const rateLimitFixturePath = join(
  githubFixturesDirectory,
  'rate-limit-exceeded.json',
)

// the pull request the recorded response describes
const reference = parsePullRequestReference('octocat/Hello-World#1')

// a placeholder token. never a real one
const placeholderToken = 'placeholder-token-for-tests'

// the stubbed fetch, restored after each test
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | null = null

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = null
})

describe('fetchPullRequestShas', () => {
  test('reads the five fields with no Authorization header when no token is given', async () => {
    // answer with the recorded pull request
    await stubFetch({ fixturePath: pullRequestFixturePath, status: 200 })

    const pullRequestShas = await fetchPullRequestShas({ reference })

    // expect the fields from the recording and the right url without a token
    expect(pullRequestShas).toEqual({
      baseSha: '553c2077f0edc3d5dc5d17262f6aa498e69d6f8e',
      headSha: '7044a8a032e85b6ab611033b2ac8af7ce85805b2',
      title: 'Edited README via GitHub',
      author: 'unoju',
      htmlUrl: 'https://github.com/octocat/Hello-World/pull/1',
    })
    const sentRequest = readSentRequest()
    expect(sentRequest.url).toBe(
      'https://api.github.com/repos/octocat/Hello-World/pulls/1',
    )
    expect(sentRequest.headers.has('Authorization')).toBe(false)
  })

  test('treats an empty token as no token', async () => {
    await stubFetch({ fixturePath: pullRequestFixturePath, status: 200 })
    await fetchPullRequestShas({ reference, token: '' })
    expect(readSentRequest().headers.has('Authorization')).toBe(false)
  })

  test('sends the token as a bearer Authorization header', async () => {
    await stubFetch({ fixturePath: pullRequestFixturePath, status: 200 })
    await fetchPullRequestShas({ reference, token: placeholderToken })
    expect(readSentRequest().headers.get('Authorization')).toBe(
      `Bearer ${placeholderToken}`,
    )
  })

  test('turns a rate limited 403 into an error naming GITHUB_TOKEN', async () => {
    // answer with the recorded rate limit body and no remaining requests
    await stubFetch({
      fixturePath: rateLimitFixturePath,
      status: 403,
      headers: { 'x-ratelimit-remaining': '0' },
    })

    // expect the typed error with the fix in its message
    const fetchPromise = fetchPullRequestShas({ reference })
    await expect(fetchPromise).rejects.toBeInstanceOf(GitHubRateLimitError)
    await expect(fetchPromise).rejects.toThrow('GITHUB_TOKEN')
  })

  test('turns a 404 into a request error with the status', async () => {
    // answer with GitHub's not found body
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ message: 'Not Found' }, { status: 404 }),
    )

    // expect a request error, not a rate limit error
    const fetchError = await fetchPullRequestShas({ reference }).catch(
      (error: unknown) => error,
    )
    expect(fetchError).toBeInstanceOf(GitHubRequestError)
    expect((fetchError as GitHubRequestError).status).toBe(404)
  })
})

interface StubFetchOptions {
  fixturePath: string
  status: number
  headers?: Record<string, string>
}

// make fetch answer once with a fixture body, status and headers
async function stubFetch({
  fixturePath,
  status,
  headers,
}: StubFetchOptions): Promise<void> {
  const fixtureText = await Bun.file(fixturePath).text()
  const fixtureResponse = new Response(fixtureText, { status, headers })
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(fixtureResponse)
}

// the url and headers of the one request the stubbed fetch received
function readSentRequest(): { url: string; headers: Headers } {
  const firstCall = fetchSpy?.mock.calls[0]
  if (firstCall === undefined) {
    throw new Error('fetch was not called')
  }
  const [input, init] = firstCall
  return { url: String(input), headers: new Headers(init?.headers) }
}
