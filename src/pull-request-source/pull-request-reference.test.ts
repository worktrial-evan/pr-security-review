// tests parsing pull request URLs and owner/repository#number text into references
import { describe, expect, test } from 'bun:test'
import {
  InvalidPullRequestReferenceError,
  parsePullRequestReference,
} from './pull-request-reference'

// the reference both accepted forms of acme/widgets#42 parse to
const expectedReference = {
  owner: 'acme',
  repository: 'widgets',
  number: 42,
  url: 'https://github.com/acme/widgets/pull/42',
}

describe('parsePullRequestReference', () => {
  test('parses the full pull request URL', () => {
    const reference = parsePullRequestReference(
      'https://github.com/acme/widgets/pull/42',
    )
    expect(reference).toEqual(expectedReference)
  })

  test('parses the short form to the same reference', () => {
    const reference = parsePullRequestReference('acme/widgets#42')
    expect(reference).toEqual(expectedReference)
  })

  test('accepts a trailing slash and dots in the repository name', () => {
    const reference = parsePullRequestReference(
      'https://github.com/acme/widgets.js/pull/7/',
    )
    expect(reference.repository).toBe('widgets.js')
    expect(reference.url).toBe('https://github.com/acme/widgets.js/pull/7')
  })

  test.each([
    'acme/widgets',
    'https://github.com/acme/widgets/issues/42',
    'acme/widgets#0',
    'https://gitlab.com/acme/widgets/pull/42',
  ])('rejects %p with a typed error', (text) => {
    expect(() => parsePullRequestReference(text)).toThrow(
      InvalidPullRequestReferenceError,
    )
  })
})
