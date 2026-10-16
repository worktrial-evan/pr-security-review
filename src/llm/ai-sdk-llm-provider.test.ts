// tests for the AI SDK provider's model id resolution: both providers and an unknown prefix
import { describe, expect, test } from 'bun:test'
import {
  resolveLanguageModel,
  resolveSamplingTemperature,
} from './ai-sdk-llm-provider'

describe('resolveLanguageModel', () => {
  test('resolves an anthropic model id', () => {
    const languageModel = resolveLanguageModel('anthropic/claude-sonnet-5-5')

    expect(languageModel.modelId).toBe('claude-sonnet-5-5')
    expect(languageModel.provider).toStartWith('anthropic')
  })

  test('resolves a fireworks model id with slashes in the model name', () => {
    const languageModel = resolveLanguageModel(
      'fireworks/accounts/fireworks/models/qwen3-coder',
    )

    expect(languageModel.modelId).toBe('accounts/fireworks/models/qwen3-coder')
    expect(languageModel.provider).toStartWith('fireworks')
  })

  test('throws on an unknown provider prefix', () => {
    expect(() => resolveLanguageModel('openai/gpt-x')).toThrow(
      'model id openai/gpt-x must start with',
    )
  })
})

describe('resolveSamplingTemperature', () => {
  test('sends no temperature to anthropic and 0 to fireworks', () => {
    expect(
      resolveSamplingTemperature('anthropic/claude-sonnet-5-5'),
    ).toBeUndefined()
    expect(
      resolveSamplingTemperature('fireworks/accounts/fireworks/models/glm'),
    ).toBe(0)
  })
})
