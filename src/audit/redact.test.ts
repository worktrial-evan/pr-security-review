// tests for redact: a token under authorization is fingerprinted, equal secrets give equal fingerprints, ordinary values pass through and the input is not mutated
import { describe, expect, test } from 'bun:test'
import { redact } from './redact'

// a made-up github token for the tests
const fakeGithubToken = 'ghp_FakeToken0123456789abcdefghijklmnopqrstuv'

// the shape of every fingerprint redact writes
const fingerprintPattern = /^sha256:[0-9a-f]{16}$/

describe('redact', () => {
  test('a github token under authorization is replaced by a fingerprint', () => {
    // redact a header block holding the token and serialize the copy
    const redactedPayload = redact({
      headers: { authorization: `Bearer ${fakeGithubToken}` },
    })
    const redactedText = JSON.stringify(redactedPayload)

    // expect the token and the scheme gone and a fingerprint in their place
    expect(redactedText).not.toContain(fakeGithubToken)
    expect(redactedText).not.toContain('Bearer')
    expect(redactedPayload.headers.authorization).toMatch(fingerprintPattern)
  })

  test('the same token in two places gives the same fingerprint', () => {
    // put the token under two different keys in two different places
    const redactedPayload = redact({
      request: { token: fakeGithubToken },
      note: fakeGithubToken,
    })

    // expect both places to hold one fingerprint
    expect(redactedPayload.request.token).toMatch(fingerprintPattern)
    expect(redactedPayload.note).toBe(redactedPayload.request.token)
  })

  test('a value under a secret-like key is fingerprinted whatever it looks like', () => {
    // give ordinary-looking values to keys that name a secret
    const redactedPayload = redact({
      apiKey: 'plain-value',
      api_key: 'plain-value',
      'API-KEY': 'plain-value',
      clientSecret: 'plain-value',
      passwd: 'plain-value',
      credentials: { user: 'alice', pass: 'plain-value' },
    })

    // expect every one of them fingerprinted, including the strings below the credentials key
    expect(redactedPayload.apiKey).toMatch(fingerprintPattern)
    expect(redactedPayload.api_key).toMatch(fingerprintPattern)
    expect(redactedPayload['API-KEY']).toMatch(fingerprintPattern)
    expect(redactedPayload.clientSecret).toMatch(fingerprintPattern)
    expect(redactedPayload.passwd).toMatch(fingerprintPattern)
    expect(redactedPayload.credentials.user).toMatch(fingerprintPattern)
    expect(redactedPayload.credentials.pass).toMatch(fingerprintPattern)
  })

  test('a token shape is fingerprinted under an ordinary key', () => {
    // put one value of each token shape under keys that say nothing about secrets
    const redactedPayload = redact({
      values: [
        'gho_FakeToken0123456789',
        'github_pat_FakeToken0123456789',
        'sk-ant-fake-key-0123456789',
        'sk-fake-key-0123456789',
        'AKIAFAKEKEY012345678',
        'xoxb-fake-0123456789',
        'xoxp-fake-0123456789',
        'xoxa-fake-0123456789',
        'Bearer fake.jwt.value',
      ],
    })

    // expect every value fingerprinted
    for (const redactedValue of redactedPayload.values) {
      expect(redactedValue).toMatch(fingerprintPattern)
    }
  })

  test('a file path, a package name and a line number come back equal', () => {
    // redact a payload holding only ordinary review data
    const ordinaryPayload = {
      file: 'src/audit/redact.ts',
      packageName: 'lodash',
      line: 42,
      isIntroducedByPullRequest: true,
      previousPath: null,
      tags: ['task-123', 'risk-free', 'desk-check'],
      nested: { inputTokens: 1200, model: 'fake-model' },
    }
    const redactedPayload = redact(ordinaryPayload)

    // expect a copy equal to the input and not the same object
    expect(redactedPayload).toEqual(ordinaryPayload)
    expect(redactedPayload).not.toBe(ordinaryPayload)
    expect(redactedPayload.nested).not.toBe(ordinaryPayload.nested)
  })

  test('the input still holds the secret after the call', () => {
    // redact a payload and look at the input afterwards
    const secretPayload = {
      headers: { authorization: `Bearer ${fakeGithubToken}` },
    }
    const redactedPayload = redact(secretPayload)

    // expect the input untouched and the copy fingerprinted
    expect(secretPayload.headers.authorization).toBe(
      `Bearer ${fakeGithubToken}`,
    )
    expect(redactedPayload.headers.authorization).toMatch(fingerprintPattern)
  })
})
