// tests for the llm contract: a prompt template round-trips and a null cost stays null
import { describe, expect, test } from 'bun:test'
import {
  llmGenerateResultSchema,
  type PromptTemplate,
  promptTemplateSchema,
} from './llm'

// the code-review prompt as the prompts module loads it
const promptTemplateSample: PromptTemplate = {
  id: 'code-review',
  version: '1',
  hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  text: 'Review the diff in {{diff}} for the weaknesses in {{vulnerabilityTypes}}.',
  variables: ['diff', 'vulnerabilityTypes'],
}

// a generate result from a model with no configured price
const unpricedGenerateResultSample = {
  output: { findings: [] },
  usage: { inputTokens: 1200, outputTokens: 340 },
  costUsd: null,
  isCacheHit: false,
  durationMs: 2140,
}

describe('promptTemplateSchema', () => {
  test('a prompt template round-trips', () => {
    expect(promptTemplateSchema.parse(promptTemplateSample)).toEqual(
      promptTemplateSample,
    )
  })
})

describe('llmGenerateResultSchema', () => {
  test('a result with costUsd null round-trips with null kept', () => {
    // parse the result and read the cost back
    const parsedGenerateResult = llmGenerateResultSchema.parse(
      unpricedGenerateResultSample,
    )
    expect(parsedGenerateResult).toEqual(unpricedGenerateResultSample)
    expect(parsedGenerateResult.costUsd).toBeNull()
  })
})
