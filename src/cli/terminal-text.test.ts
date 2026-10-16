// tests the terminal sanitizer. control characters go. newlines and tabs stay
import { describe, expect, test } from 'bun:test'
import { toTerminalText } from './terminal-text'

describe('toTerminalText', () => {
  test('removes the escape character of an ANSI sequence', () => {
    expect(toTerminalText('\u001b[31mred\u001b[0m title')).toBe(
      '[31mred[0m title',
    )
  })

  test('removes carriage returns, bells, deletes and C1 controls', () => {
    expect(toTerminalText('a\rb\u0007c\u007fd\u009be')).toBe('abcde')
  })

  test('keeps newlines, tabs and ordinary text', () => {
    expect(toTerminalText('line one\n\tline two é')).toBe(
      'line one\n\tline two é',
    )
  })
})
