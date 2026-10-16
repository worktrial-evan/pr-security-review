// tests the CWE allowlist: unique ids, only CWEs with an untrusted input, the membership check and the rendered lines
import { describe, expect, test } from 'bun:test'
import { allowedCwes, isAllowedCwe, renderCweAllowlist } from './cwe-allowlist'

// the ids in tuple order
const allowedCweIds = allowedCwes.map((allowedCwe) => allowedCwe.id)

describe('allowedCwes', () => {
  test('has unique ids', () => {
    expect(new Set(allowedCweIds).size).toBe(allowedCweIds.length)
  })

  test('names every id as CWE followed by a number', () => {
    for (const allowedCweId of allowedCweIds) {
      expect(allowedCweId).toMatch(/^CWE-[1-9][0-9]*$/)
    }
  })

  test('holds no CWE without an untrusted input', () => {
    // check that cleartext storage, cleartext transmission, a weak algorithm, weak randomness, permission assignment and a hard-coded credential are left out
    const cweIdsWithoutUntrustedInput = [
      'CWE-312',
      'CWE-319',
      'CWE-327',
      'CWE-330',
      'CWE-732',
      'CWE-798',
    ]
    for (const cweIdWithoutUntrustedInput of cweIdsWithoutUntrustedInput) {
      expect(isAllowedCwe(cweIdWithoutUntrustedInput)).toBe(false)
    }

    // check that sql injection, cross-site scripting, command injection, missing authorization and server-side request forgery are in
    const cweIdsWithUntrustedInput = [
      'CWE-89',
      'CWE-79',
      'CWE-78',
      'CWE-862',
      'CWE-918',
    ]
    for (const cweIdWithUntrustedInput of cweIdsWithUntrustedInput) {
      expect(isAllowedCwe(cweIdWithUntrustedInput)).toBe(true)
    }
  })
})

describe('isAllowedCwe', () => {
  test('returns true for an allowed id', () => {
    expect(isAllowedCwe('CWE-89')).toBe(true)
  })

  test('returns false for an id outside the list and for an empty string', () => {
    expect(isAllowedCwe('CWE-9999')).toBe(false)
    expect(isAllowedCwe('')).toBe(false)
  })
})

describe('renderCweAllowlist', () => {
  test('renders one line per entry, each starting with that entry id', () => {
    // split the rendered text and read the id before the colon on each line
    const renderedLines = renderCweAllowlist().split('\n')
    const renderedIds = renderedLines.map((renderedLine) =>
      renderedLine.slice(0, renderedLine.indexOf(':')),
    )

    expect(renderedLines).toHaveLength(allowedCwes.length)
    expect(renderedIds).toEqual(allowedCweIds)
  })

  test('renders each line as the id, a colon, a space and the name', () => {
    expect(renderCweAllowlist()).toContain('CWE-89: SQL Injection')
  })
})
