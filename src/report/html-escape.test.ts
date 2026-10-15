// tests that HTML escaping covers every markup character and that only https urls become links
import { describe, expect, test } from 'bun:test'
import { escapeHtml, renderLink } from './html-escape'

describe('escapeHtml', () => {
  test('escapes ampersands, angle brackets and both quote kinds', () => {
    const escapedText = escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)
    expect(escapedText).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    )
  })

  test('leaves ordinary text unchanged', () => {
    expect(escapeHtml('lodash 4.17.20')).toBe('lodash 4.17.20')
  })
})

describe('renderLink', () => {
  test('renders an anchor for an https url', () => {
    const link = renderLink({ url: 'https://osv.dev/x?a=1&b=2', label: 'x' })
    expect(link).toBe(
      '<a href="https://osv.dev/x?a=1&amp;b=2" rel="noreferrer">x</a>',
    )
  })

  test('shows a javascript url as escaped text without a link', () => {
    const link = renderLink({ url: 'javascript:alert(1)', label: '<b>x</b>' })
    expect(link).toBe('&lt;b&gt;x&lt;/b&gt;')
  })
})
