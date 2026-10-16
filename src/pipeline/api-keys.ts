// names the provider api keys a review needs and finds the ones missing from the environment
import { type ModelProvider, parseModelId } from '@/llm/model-config'
import type { ReviewOptions } from '@/shared/review'

// the environment variable that holds each provider's api key
export const apiKeyEnvironmentVariablesByProvider: Record<
  ModelProvider,
  string
> = {
  anthropic: 'ANTHROPIC_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
}

// the review options to check and the environment to look in
export interface FindMissingApiKeysOptions {
  reviewOptions: ReviewOptions
  environment: Record<string, string | undefined>
}

/**
 * Returns the api key variable names the configured models need and the environment lacks, none when the llm is off.
 */
export function findMissingApiKeys({
  reviewOptions,
  environment,
}: FindMissingApiKeysOptions): string[] {
  // a run without the llm needs no key
  if (!reviewOptions.isLlmEnabled) {
    return []
  }

  // name the key of each model's provider once
  const modelIds = [reviewOptions.reviewModelId, reviewOptions.summarizeModelId]
  const requiredVariableNames = new Set(
    modelIds.map(
      (modelId) =>
        apiKeyEnvironmentVariablesByProvider[parseModelId(modelId).provider],
    ),
  )

  // keep the names whose value is unset or empty
  const missingVariableNames = [...requiredVariableNames].filter(
    (variableName) => (environment[variableName] ?? '') === '',
  )
  return missingVariableNames
}
