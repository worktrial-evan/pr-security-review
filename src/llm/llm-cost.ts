// computes the USD cost of one model call from its token usage and the configured prices
import type { LlmUsage } from '@/shared/llm'
import type { ModelPrices } from './model-config'

// the price map is per million tokens
const tokensPerPriceUnit = 1_000_000

// the call to price and the prices to use
export interface ComputeCostUsdOptions {
  modelId: string
  usage: LlmUsage
  prices: ModelPrices
}

/**
 * Returns the cost of a call in USD, or null with a warning when the model has no price.
 */
export function computeCostUsd({
  modelId,
  usage,
  prices,
}: ComputeCostUsdOptions): number | null {
  // warn instead of failing when the model is not priced
  const modelPrice = prices[modelId]
  if (!modelPrice) {
    console.warn(`llm: no price for model ${modelId}, costUsd is null`)
    return null
  }

  // multiply each token count by its price
  const inputCostUsd =
    (usage.inputTokens * modelPrice.inputUsdPerMillionTokens) /
    tokensPerPriceUnit
  const outputCostUsd =
    (usage.outputTokens * modelPrice.outputUsdPerMillionTokens) /
    tokensPerPriceUnit
  return inputCostUsd + outputCostUsd
}
