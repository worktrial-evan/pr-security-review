// tests the string comparator: equal strings, the sign of each order, uppercase before lowercase, digits by code unit and a prefix first
import { describe, expect, test } from 'bun:test'
import { compareStrings } from './compare-strings'

describe('compareStrings', () => {
  test('returns 0 for equal strings', () => {
    expect(compareStrings({ first: 'src/a.ts', second: 'src/a.ts' })).toBe(0)
  })

  test('returns -1 when the first string comes first and 1 when it comes second', () => {
    expect(compareStrings({ first: 'src/a.ts', second: 'src/b.ts' })).toBe(-1)
    expect(compareStrings({ first: 'src/b.ts', second: 'src/a.ts' })).toBe(1)
  })

  test('puts uppercase before lowercase, as code units order them', () => {
    expect(
      compareStrings({ first: 'src/Zeta.ts', second: 'src/alpha.ts' }),
    ).toBe(-1)
  })

  test('puts CWE-1321 before CWE-20, comparing code units instead of numbers', () => {
    expect(compareStrings({ first: 'CWE-1321', second: 'CWE-20' })).toBe(-1)
  })

  test('puts a prefix before the longer string', () => {
    expect(compareStrings({ first: 'src/a', second: 'src/a.ts' })).toBe(-1)
  })
})
