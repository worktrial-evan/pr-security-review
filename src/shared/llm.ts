// the llm contract: prompt templates, the options and result of one structured generate call, and the LlmClient interface
import { z } from 'zod'

// a versioned prompt file with the variables its text interpolates
export const promptTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  hash: z.string(),
  text: z.string(),
  variables: z.array(z.string()),
})
export type PromptTemplate = z.infer<typeof promptTemplateSchema>

// one structured generate call. schema validates the model output into T, modelId overrides the configured model
export interface LlmGenerateOptions<T> {
  promptId: string
  promptVersion: string
  promptHash: string
  system: string
  user: string
  schema: z.ZodType<T>
  modelId?: string
}

// the tokens one generate call consumed
export const llmUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
})
export type LlmUsage = z.infer<typeof llmUsageSchema>

// the result of one generate call. costUsd is null when the model has no price
export const llmGenerateResultSchema = z.object({
  output: z.unknown(),
  usage: llmUsageSchema,
  costUsd: z.number().nonnegative().nullable(),
  isCacheHit: z.boolean(),
  durationMs: z.number().nonnegative(),
})
type LlmGenerateResultBase = z.infer<typeof llmGenerateResultSchema>

// the generate result with its output narrowed to the schema's type
export type LlmGenerateResult<T> = Omit<LlmGenerateResultBase, 'output'> & {
  output: T
}

// a model client that returns output validated against the caller's schema
export interface LlmClient {
  generate<T>(options: LlmGenerateOptions<T>): Promise<LlmGenerateResult<T>>
}
