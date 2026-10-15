// tests for the cost math: a priced model and an unpriced model that warns and returns null
import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test'
import { computeCostUsd } from './llm-cost'
import type { ModelPrices } from './model-config'

// one model at 3 USD per million input tokens and 15 per million output tokens
const samplePrices: ModelPrices = {
  'anthropic/claude-sonnet-5-5': {
    inputUsdPerMillionTokens: 3,
    outputUsdPerMillionTokens: 15,
  },
}

describe('computeCostUsd', () => {
  // silence and record warnings in every test
  const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
  afterEach(() => {
    warnSpy.mockClear()
  })
  afterAll(() => {
    warnSpy.mockRestore()
  })

  test('multiplies usage by the per million prices', () => {
    const costUsd = computeCostUsd({
      modelId: 'anthropic/claude-sonnet-5-5',
      usage: { inputTokens: 1000, outputTokens: 500 },
      prices: samplePrices,
    })

    expect(costUsd).toBeCloseTo(0.0105, 10)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('returns null and warns for an unpriced model', () => {
    const costUsd = computeCostUsd({
      modelId: 'fireworks/unpriced-model',
      usage: { inputTokens: 1000, outputTokens: 500 },
      prices: samplePrices,
    })

    expect(costUsd).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
      'fireworks/unpriced-model',
    )
  })
})
