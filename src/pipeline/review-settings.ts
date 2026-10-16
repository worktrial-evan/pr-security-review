// reads config/review.json and config/models.json. builds the review options and limits and prompt version a run uses
import { join } from 'node:path'
import { z } from 'zod'
import { type ModelPrices, readModelConfig } from '@/llm/model-config'
import { resolveCacheDirectory } from '@/shared/cache-directory'
import type { Severity } from '@/shared/finding'
import type { ReviewOptions } from '@/shared/review'

// the shape of config/review.json. reviewPromptVersion is the live code-review prompt version
export const reviewConfigSchema = z.strictObject({
  contextLines: z.number().int().nonnegative(),
  isLlmEnabled: z.boolean(),
  isCacheEnabled: z.boolean(),
  advisoryStaleHours: z.number().positive(),
  reviewPromptVersion: z.string().regex(/^[1-9][0-9]*$/),
  maxChangedFiles: z.number().int().positive(),
  maxFileBytes: z.number().int().positive(),
  maxReviewCostUsd: z.number().nonnegative(),
})
export type ReviewConfig = z.infer<typeof reviewConfigSchema>

// the per-run limits against a hostile pull request
export type ReviewLimits = Pick<
  ReviewConfig,
  'maxChangedFiles' | 'maxFileBytes' | 'maxReviewCostUsd'
>

// config/review.json at the repository root
export const defaultReviewConfigPath = join(
  import.meta.dir,
  '..',
  '..',
  'config',
  'review.json',
)

// the values a command line flag or a benchmark run may change for one run
export interface ReviewSettingsOverrides {
  isLlmEnabled?: boolean
  isCacheEnabled?: boolean
  isOffline?: boolean
  advisoryCacheDir?: string
  reviewModelId?: string
  summarizeModelId?: string
  reviewPromptVersion?: string
  failOnSeverity?: Severity
}

// everything a run takes from configuration
export interface ReviewSettings {
  reviewOptions: ReviewOptions
  limits: ReviewLimits
  reviewPromptVersion: string
  advisoryStaleHours: number
  modelPrices: ModelPrices
}

// the settings of a run besides the review options
export type RunSettings = Omit<ReviewSettings, 'reviewOptions'>

// the two config files and the overrides that settings are built from
export interface LoadReviewSettingsOptions {
  overrides?: ReviewSettingsOverrides
  reviewConfigPath?: string
  modelConfigPath?: string
}

/**
 * Reads both config files and returns the settings of one run with the overrides applied.
 */
export async function loadReviewSettings({
  overrides = {},
  reviewConfigPath = defaultReviewConfigPath,
  modelConfigPath,
}: LoadReviewSettingsOptions = {}): Promise<ReviewSettings> {
  // read both files
  const reviewConfig = await readReviewConfig(reviewConfigPath)
  const modelConfig = await readModelConfig(modelConfigPath)

  // apply each override over its configured default
  const reviewOptions: ReviewOptions = {
    isLlmEnabled: overrides.isLlmEnabled ?? reviewConfig.isLlmEnabled,
    isCacheEnabled: overrides.isCacheEnabled ?? reviewConfig.isCacheEnabled,
    isOffline: overrides.isOffline ?? false,
    advisoryCacheDir: overrides.advisoryCacheDir ?? resolveCacheDirectory(),
    reviewModelId: overrides.reviewModelId ?? modelConfig.reviewModelId,
    summarizeModelId:
      overrides.summarizeModelId ?? modelConfig.summarizeModelId,
    contextLines: reviewConfig.contextLines,
    failOnSeverity: overrides.failOnSeverity,
  }
  return {
    reviewOptions,
    limits: {
      maxChangedFiles: reviewConfig.maxChangedFiles,
      maxFileBytes: reviewConfig.maxFileBytes,
      maxReviewCostUsd: reviewConfig.maxReviewCostUsd,
    },
    reviewPromptVersion:
      overrides.reviewPromptVersion ?? reviewConfig.reviewPromptVersion,
    advisoryStaleHours: reviewConfig.advisoryStaleHours,
    modelPrices: modelConfig.prices,
  }
}

/**
 * Reads and validates the review config file.
 */
export async function readReviewConfig(
  configPath: string = defaultReviewConfigPath,
): Promise<ReviewConfig> {
  // parse the file and validate it against the schema
  const configValue: unknown = await Bun.file(configPath).json()
  const reviewConfigResult = reviewConfigSchema.safeParse(configValue)
  if (!reviewConfigResult.success) {
    throw new Error(
      `review config ${configPath} is invalid: ${reviewConfigResult.error.message}`,
    )
  }
  return reviewConfigResult.data
}
