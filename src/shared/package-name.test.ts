// tests the npm package name rule: case, whitespace, scoped names and an already normalized name
import { describe, expect, test } from 'bun:test'
import { normalizePackageName } from './package-name'

describe('normalizePackageName', () => {
  test('trims and lowercases a name', () => {
    expect(normalizePackageName(' Haraka ')).toBe('haraka')
  })

  test('lowercases both parts of a scoped name', () => {
    expect(normalizePackageName('@XMLDom/XMLDom')).toBe('@xmldom/xmldom')
  })

  test('returns an already normalized name unchanged', () => {
    expect(normalizePackageName('node-fetch')).toBe('node-fetch')
    expect(normalizePackageName(normalizePackageName(' JSONStream'))).toBe(
      'jsonstream',
    )
  })
})
