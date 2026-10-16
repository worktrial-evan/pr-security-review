// tests the stable hash over key order and maps and sets and values JSON cannot hold
import { describe, expect, test } from 'bun:test'
import { hashValue, toStableJson } from './stable-hash'

describe('hashValue', () => {
  test('gives equal hashes for objects with keys in a different order', () => {
    expect(hashValue({ first: 1, second: { a: 1, b: 2 } })).toBe(
      hashValue({ second: { b: 2, a: 1 }, first: 1 }),
    )
  })

  test('includes map entries and set values', () => {
    expect(toStableJson(new Map([['lodash', new Set(['4.17.20'])]]))).toBe(
      '[["lodash",["4.17.20"]]]',
    )
    expect(hashValue(new Map([['a', 1]]))).not.toBe(
      hashValue(new Map([['a', 2]])),
    )
  })

  test('drops undefined and function members and hashes undefined as null', () => {
    expect(toStableJson({ kept: 1, missing: undefined, run: () => 1 })).toBe(
      '{"kept":1}',
    )
    expect(toStableJson(undefined)).toBe('null')
  })
})
