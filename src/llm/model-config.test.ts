// tests for the model config: the checked-in file parses and every model id names its provider
import { describe, expect, test } from 'bun:test'
import { modelProviders, parseModelId, readModelConfig } from './model-config'

describe('readModelConfig', () => {
  test('parses the checked-in config/models.json', async () => {
    const modelConfig = await readModelConfig()

    // every default model has a price entry
    expect(modelConfig.prices[modelConfig.reviewModelId]).toBeDefined()
    expect(modelConfig.prices[modelConfig.summarizeModelId]).toBeDefined()
  })

  test('names a known provider in every model id', async () => {
    // gather the defaults and every priced id
    const modelConfig = await readModelConfig()
    const modelIds = [
      modelConfig.reviewModelId,
      modelConfig.summarizeModelId,
      ...Object.keys(modelConfig.prices),
    ]

    for (const modelId of modelIds) {
      expect(modelProviders).toContain(parseModelId(modelId).provider)
    }
  })
})

describe('parseModelId', () => {
  test('splits at the first slash only', () => {
    expect(
      parseModelId('fireworks/accounts/fireworks/models/qwen3-coder'),
    ).toEqual({
      provider: 'fireworks',
      modelName: 'accounts/fireworks/models/qwen3-coder',
    })
  })

  test('throws on an unknown provider', () => {
    expect(() => parseModelId('openai/gpt-x')).toThrow(
      'model id openai/gpt-x must start with anthropic/ or fireworks/',
    )
  })
})
