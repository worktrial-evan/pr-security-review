// tests the metered llm client: costs add to the shared meter and calls stop at the limit
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import type { LlmClient, LlmGenerateOptions } from '@/shared/llm'
import {
  createMeteredLlmClient,
  ReviewCostLimitError,
} from './metered-llm-client'

// a client that answers every call with the given cost and counts its calls
function createCostingClient(
  costUsd: number | null,
): LlmClient & { callCount: number } {
  const costingClient = {
    callCount: 0,
    async generate<T>(generateOptions: LlmGenerateOptions<T>) {
      costingClient.callCount += 1
      return {
        output: generateOptions.schema.parse({}),
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd,
        isCacheHit: false,
        durationMs: 1,
      }
    },
  }
  return costingClient
}

// the options of one generate call
const generateOptions: LlmGenerateOptions<Record<string, never>> = {
  promptId: 'code-review',
  promptVersion: '1',
  promptHash: 'hash',
  system: 'system',
  user: 'user',
  schema: z.object({}).strict() as z.ZodType<Record<string, never>>,
}

describe('createMeteredLlmClient', () => {
  test('adds every call cost to the shared meter and treats a missing price as zero', async () => {
    const costMeter = { totalCostUsd: 0 }
    const pricedClient = createMeteredLlmClient({
      llmClient: createCostingClient(0.25),
      costMeter,
    })
    const unpricedClient = createMeteredLlmClient({
      llmClient: createCostingClient(null),
      costMeter,
    })

    await pricedClient.generate(generateOptions)
    await pricedClient.generate(generateOptions)
    await unpricedClient.generate(generateOptions)

    expect(costMeter.totalCostUsd).toBe(0.5)
  })

  test('refuses a call once the meter reaches the limit without calling the model', async () => {
    // spend the limit with two calls
    const costMeter = { totalCostUsd: 0 }
    const costingClient = createCostingClient(1)
    const meteredClient = createMeteredLlmClient({
      llmClient: costingClient,
      costMeter,
      maxCostUsd: 2,
    })
    await meteredClient.generate(generateOptions)
    await meteredClient.generate(generateOptions)

    // the third call is refused before it reaches the model
    await expect(
      meteredClient.generate(generateOptions),
    ).rejects.toBeInstanceOf(ReviewCostLimitError)
    expect(costingClient.callCount).toBe(2)
  })
})
