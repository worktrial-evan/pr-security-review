// creates the review and summarize model clients of one run. both are metered against the run's cost
import { createLlmClient } from '@/llm/llm-client'
import type { LlmProvider } from '@/llm/llm-provider'
import type { LlmClient } from '@/shared/llm'
import type { ReviewOptions } from '@/shared/review'
import { createMeteredLlmClient } from './metered-llm-client'
import type { RunSettings } from './review-settings'
import type { RunRecord } from './run-record'

// the two model clients a run uses
export interface ReviewLlmClients {
  reviewLlmClient: LlmClient
  summarizeLlmClient: LlmClient
}

// what the clients are built from. tests replace the provider and the cache directory
export interface CreateReviewLlmClientsOptions {
  runRecord: RunRecord
  reviewOptions: ReviewOptions
  runSettings: RunSettings
  llmProvider?: LlmProvider
  llmCacheDirectory?: string
}

/**
 * Creates the two model clients of a run, or undefined when the llm is off. Only the review client is held to the cost limit.
 */
export function createReviewLlmClients({
  runRecord,
  reviewOptions,
  runSettings,
  llmProvider,
  llmCacheDirectory,
}: CreateReviewLlmClientsOptions): ReviewLlmClients | undefined {
  // a run without the llm has no clients
  if (!reviewOptions.isLlmEnabled) {
    return undefined
  }

  // build one client per model on the same prices and audit sink and cache
  const sharedClientOptions = {
    prices: runSettings.modelPrices,
    auditSink: runRecord.auditSink,
    runId: runRecord.runId,
    isCacheEnabled: reviewOptions.isCacheEnabled,
    cacheDirectory: llmCacheDirectory,
    provider: llmProvider,
  }
  const reviewModelClient = createLlmClient({
    ...sharedClientOptions,
    modelId: reviewOptions.reviewModelId,
  })
  const summarizeModelClient = createLlmClient({
    ...sharedClientOptions,
    modelId: reviewOptions.summarizeModelId,
  })

  // meter both into the run's total and hold the review client to the limit
  return {
    reviewLlmClient: createMeteredLlmClient({
      llmClient: reviewModelClient,
      costMeter: runRecord.costMeter,
      maxCostUsd: runSettings.limits.maxReviewCostUsd,
    }),
    summarizeLlmClient: createMeteredLlmClient({
      llmClient: summarizeModelClient,
      costMeter: runRecord.costMeter,
    }),
  }
}
