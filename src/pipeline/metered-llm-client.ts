// wraps an llm client to add every call's cost to the run total and to refuse calls once a cost limit is reached
import type {
  LlmClient,
  LlmGenerateOptions,
  LlmGenerateResult,
} from '@/shared/llm'

// the model cost a run has spent so far. every client of the run shares it
export interface CostMeter {
  totalCostUsd: number
}

// the error a metered client throws instead of calling the model once the limit is reached
export class ReviewCostLimitError extends Error {
  override readonly name = 'ReviewCostLimitError'
  readonly spentCostUsd: number
  readonly maxCostUsd: number

  constructor({ spentCostUsd, maxCostUsd }: ReviewCostLimitErrorOptions) {
    super(
      `review cost limit reached: spent $${spentCostUsd.toFixed(4)} of $${maxCostUsd.toFixed(2)}`,
    )
    this.spentCostUsd = spentCostUsd
    this.maxCostUsd = maxCostUsd
  }
}

// the spend and the limit a cost limit error reports
export interface ReviewCostLimitErrorOptions {
  spentCostUsd: number
  maxCostUsd: number
}

// the client to wrap and the meter it adds to. the optional limit is checked before each call
export interface CreateMeteredLlmClientOptions {
  llmClient: LlmClient
  costMeter: CostMeter
  maxCostUsd?: number
}

/**
 * Creates a client that adds each call's cost to the meter and refuses a call once the meter reaches maxCostUsd.
 */
export function createMeteredLlmClient({
  llmClient,
  costMeter,
  maxCostUsd,
}: CreateMeteredLlmClientOptions): LlmClient {
  return {
    async generate<T>(
      generateOptions: LlmGenerateOptions<T>,
    ): Promise<LlmGenerateResult<T>> {
      // refuse the call when the run has already spent the limit
      if (maxCostUsd !== undefined && costMeter.totalCostUsd >= maxCostUsd) {
        throw new ReviewCostLimitError({
          spentCostUsd: costMeter.totalCostUsd,
          maxCostUsd,
        })
      }

      // call the model and add its cost. a call without a price adds nothing
      const generateResult = await llmClient.generate(generateOptions)
      costMeter.totalCostUsd += generateResult.costUsd ?? 0
      return generateResult
    },
  }
}
