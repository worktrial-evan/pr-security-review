// reads a pull request's base and head shas, title, author and URL from the GitHub REST API
import { z } from 'zod'
import type { PullRequestReference } from '@/shared/pull-request-source'

// the GitHub REST API root
const githubApiUrl = 'https://api.github.com'

// the part of the pull request response this module reads
const pullRequestResponseSchema = z.object({
  html_url: z.string(),
  title: z.string(),
  user: z.object({ login: z.string() }),
  base: z.object({ sha: z.string() }),
  head: z.object({ sha: z.string() }),
})

// the error body GitHub sends with a failed request
const errorResponseSchema = z.object({ message: z.string() })

export interface FetchPullRequestShasOptions {
  reference: PullRequestReference
  token?: string
}

// the pull request fields the module needs from GitHub
export interface PullRequestShas {
  baseSha: string
  headSha: string
  title: string
  author: string
  htmlUrl: string
}

// thrown when GitHub refuses a request because the rate limit is used up
export class GitHubRateLimitError extends Error {
  readonly status: number

  constructor(status: number) {
    super(
      `GitHub API rate limit exceeded (status ${status}). Set GITHUB_TOKEN to a GitHub token to raise the limit`,
    )
    this.name = 'GitHubRateLimitError'
    this.status = status
  }
}

// thrown when GitHub answers with any other non-success status
export class GitHubRequestError extends Error {
  readonly status: number

  constructor(status: number, githubMessage: string) {
    super(`GitHub API request failed with status ${status}: ${githubMessage}`)
    this.name = 'GitHubRequestError'
    this.status = status
  }
}

/**
 * Fetches a pull request's base and head shas, title, author and URL, sending Authorization only when a token is given.
 */
export async function fetchPullRequestShas({
  reference,
  token,
}: FetchPullRequestShasOptions): Promise<PullRequestShas> {
  // request the pull request
  const pullRequestUrl = `${githubApiUrl}/repos/${reference.owner}/${reference.repo}/pulls/${reference.number}`
  const response = await fetch(pullRequestUrl, {
    headers: buildRequestHeaders(token),
  })

  // turn a failed response into a typed error
  if (!response.ok) {
    throw await toRequestError(response)
  }

  // pick the fields out of the response
  const responseBody: unknown = await response.json()
  const pullRequestResponse = pullRequestResponseSchema.parse(responseBody)
  return {
    baseSha: pullRequestResponse.base.sha,
    headSha: pullRequestResponse.head.sha,
    title: pullRequestResponse.title,
    author: pullRequestResponse.user.login,
    htmlUrl: pullRequestResponse.html_url,
  }
}

// build the request headers, with Authorization only for a non-empty token
function buildRequestHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pr-review',
    'X-GitHub-Api-Version': '2022-11-28',
  })
  if (token !== undefined && token !== '') {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

// build the error for a failed response: a rate limit error or a request error
async function toRequestError(response: Response): Promise<Error> {
  // read the message GitHub sent, if any
  const responseBody: unknown = await response.json().catch(() => null)
  const errorResponseParseResult = errorResponseSchema.safeParse(responseBody)
  const githubMessage = errorResponseParseResult.success
    ? errorResponseParseResult.data.message
    : response.statusText

  // detect the primary and the secondary rate limit
  const isLimitStatus = response.status === 403 || response.status === 429
  const isRemainingZero = response.headers.get('x-ratelimit-remaining') === '0'
  const isRateLimitMessage = /rate limit/i.test(githubMessage)
  if (isLimitStatus && (isRemainingZero || isRateLimitMessage)) {
    return new GitHubRateLimitError(response.status)
  }
  return new GitHubRequestError(response.status, githubMessage)
}
