// parses a GitHub pull request URL or owner/repo#number text into a PullRequestReference
import {
  type PullRequestReference,
  pullRequestReferenceSchema,
} from '@/shared/pull-request-source'

// the full pull request URL form: https://github.com/owner/repo/pull/123
const pullRequestUrlPattern =
  /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)\/?$/

// the short form: owner/repo#123
const pullRequestShortPattern = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)#(\d+)$/

// thrown when text is neither a pull request URL nor the owner/repo#number form
export class InvalidPullRequestReferenceError extends Error {
  readonly text: string

  constructor(text: string) {
    super(
      `'${text}' is not a pull request reference. Use https://github.com/owner/repo/pull/123 or owner/repo#123`,
    )
    this.name = 'InvalidPullRequestReferenceError'
    this.text = text
  }
}

/**
 * Parses a GitHub pull request URL or owner/repo#number text into a reference with the canonical URL.
 */
export function parsePullRequestReference(text: string): PullRequestReference {
  // match either accepted form
  const trimmedText = text.trim()
  const referenceMatch =
    pullRequestUrlPattern.exec(trimmedText) ??
    pullRequestShortPattern.exec(trimmedText)
  if (referenceMatch === null) {
    throw new InvalidPullRequestReferenceError(text)
  }

  // build the reference with the canonical URL
  const [, owner = '', repo = '', numberText = ''] = referenceMatch
  const pullRequestNumber = Number(numberText)
  const candidateReference = {
    owner,
    repo,
    number: pullRequestNumber,
    url: `https://github.com/${owner}/${repo}/pull/${pullRequestNumber}`,
  }

  // reject a number the contract does not allow, such as zero
  const referenceParseResult =
    pullRequestReferenceSchema.safeParse(candidateReference)
  if (!referenceParseResult.success) {
    throw new InvalidPullRequestReferenceError(text)
  }
  return referenceParseResult.data
}
