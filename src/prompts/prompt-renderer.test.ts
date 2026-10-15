// tests for prompt rendering: every variable filled, a missing variable rejected, and braces inside a value kept
import { describe, expect, test } from 'bun:test'
import type { PromptTemplate } from '@/shared/llm'
import { findPlaceholderNames, renderPrompt } from './prompt-renderer'

// a template with two variables, one used twice
const reviewTemplate: PromptTemplate = {
  id: 'review-sample',
  version: '1',
  hash: 'a'.repeat(64),
  text: 'Review {{path}}.\n\n{{diff}}\n\nAgain: {{path}}',
  variables: ['path', 'diff'],
}

describe('findPlaceholderNames', () => {
  test('lists each placeholder once in order of first use', () => {
    expect(findPlaceholderNames(reviewTemplate.text)).toEqual(['path', 'diff'])
  })
})

describe('renderPrompt', () => {
  test('fills every placeholder and leaves none behind', () => {
    // render with both values
    const renderedPrompt = renderPrompt(reviewTemplate, {
      path: 'src/app.ts',
      diff: '+ eval(input)',
    })

    expect(renderedPrompt).toBe(
      'Review src/app.ts.\n\n+ eval(input)\n\nAgain: src/app.ts',
    )
    expect(findPlaceholderNames(renderedPrompt)).toEqual([])
  })

  test('throws naming the missing variable', () => {
    expect(() => renderPrompt(reviewTemplate, { path: 'src/app.ts' })).toThrow(
      'missing variables: diff',
    )
  })

  test('keeps a value that contains a placeholder as written', () => {
    // a diff that itself contains template syntax
    const renderedPrompt = renderPrompt(reviewTemplate, {
      path: 'view.hbs',
      diff: '+ <p>{{path}}</p>',
    })

    expect(renderedPrompt).toContain('+ <p>{{path}}</p>')
    expect(renderedPrompt.startsWith('Review view.hbs.')).toBe(true)
  })
})
