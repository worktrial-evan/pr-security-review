// tests that the tag-balance helper accepts balanced html and names the first unclosed or mismatched tag
import { describe, expect, test } from 'bun:test'
import { findTagImbalance } from './tag-balance'

describe('findTagImbalance', () => {
  test('returns null for balanced html with void elements, comments and a doctype', () => {
    const html =
      '<!doctype html><html><head><meta charset="utf-8"></head><body><!-- note --><p>a<br>b</p><input type="checkbox"></body></html>'
    expect(findTagImbalance(html)).toBeNull()
  })

  test('ignores tag-like text inside script and style elements', () => {
    const html =
      '<body><script>if (a < b && c > d) { x = "<div>" }</script><style>a > b {}</style></body>'
    expect(findTagImbalance(html)).toBeNull()
  })

  test('accepts a greater-than sign inside a quoted attribute value', () => {
    expect(findTagImbalance('<p title="a > b">x</p>')).toBeNull()
  })

  test('names an unclosed tag', () => {
    expect(findTagImbalance('<div><p>text</div>')).toBe(
      'unexpected closing tag </div>, expected </p>',
    )
    expect(findTagImbalance('<div><span>')).toBe('unclosed tag <span>')
  })

  test('names a closing tag with nothing open', () => {
    expect(findTagImbalance('</p>')).toBe(
      'unexpected closing tag </p>, expected </nothing>',
    )
  })
})
