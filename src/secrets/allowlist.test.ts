// tests the allowlist checks: placeholder words, fixture and example env paths, the secrets-allow line ending and the entropy measure

import { describe, expect, test } from 'bun:test'
import {
  calculateShannonEntropy,
  isAllowlistedFile,
  isAllowlistedLine,
  isAllowlistedValue,
} from './allowlist'

describe('isAllowlistedValue', () => {
  test.each([
    ['EXAMPLE', 'AKIA0000000000EXAMPLE'],
    ['xxxx', 'token-xxxx-token'],
    ['<', '<your-token-here>'],
    ['placeholder', 'my-Placeholder-value'],
    ['CHANGEME', 'changeme-before-deploy'],
  ])('flags a value containing %s in any letter case', (_word, value) => {
    expect(isAllowlistedValue(value)).toBe(true)
  })

  test('keeps an ordinary value', () => {
    expect(isAllowlistedValue('q7Zk2mXp9LrT4vBn8WcY5hJd')).toBe(false)
  })
})

describe('isAllowlistedFile', () => {
  test.each([
    'test/fixtures/config.ts',
    'src/secrets/fixtures/leak.txt',
    '.env.example',
    'apps/web/.env.sample',
    '.env.template',
  ])('allows %s', (path) => {
    expect(isAllowlistedFile(path)).toBe(true)
  })

  test.each(['src/config.ts', '.env', '.env.production', 'docs/example.md'])(
    'scans %s',
    (path) => {
      expect(isAllowlistedFile(path)).toBe(false)
    },
  )
})

describe('isAllowlistedLine', () => {
  test.each([
    'const a = "b" // secrets-allow',
    'a=b # secrets-allow',
    'a = b -- secrets-allow  ',
    'const a = "b" /* secrets-allow */',
    '<p>a</p> <!-- secrets-allow -->',
  ])('allows a line ending in a marker: %s', (text) => {
    expect(isAllowlistedLine(text)).toBe(true)
  })

  test('scans a line where the marker is not at the end', () => {
    expect(isAllowlistedLine('// secrets-allow\nconst a = "b"')).toBe(false)
    expect(isAllowlistedLine('const a = "b" // secrets-allow because')).toBe(
      false,
    )
  })
})

describe('calculateShannonEntropy', () => {
  test('is zero for a repeated character', () => {
    expect(calculateShannonEntropy('aaaaaaaaaaaaaaaaaaaa')).toBe(0)
  })

  test('is low for a repeated short pattern', () => {
    expect(calculateShannonEntropy('abababababababababab')).toBeLessThan(3.5)
  })

  test('is high for a string of distinct characters', () => {
    expect(calculateShannonEntropy('q7Zk2mXp9LrT4vBn8WcY')).toBeGreaterThan(4)
  })
})
