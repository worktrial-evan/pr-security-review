// reads config/models.json: the default model ids and the price per million tokens of each model
import { join } from 'node:path'
import { type ParseError, parse as parseJsonc } from 'jsonc-parser'
import { z } from 'zod'

// the providers a model id can name
export const modelProviders = ['anthropic', 'fireworks'] as const
export type ModelProvider = (typeof modelProviders)[number]

// a model id: the provider, a slash, then the provider's own model name
const modelIdPattern = /^(anthropic|fireworks)\/(.+)$/
export const modelIdSchema = z.string().regex(modelIdPattern)

// the USD price of a million input tokens and a million output tokens
export const modelPriceSchema = z.object({
  inputUsdPerMillionTokens: z.number().nonnegative(),
  outputUsdPerMillionTokens: z.number().nonnegative(),
})
export type ModelPrice = z.infer<typeof modelPriceSchema>

// the price of each model, keyed by model id
export const modelPricesSchema = z.record(modelIdSchema, modelPriceSchema)
export type ModelPrices = z.infer<typeof modelPricesSchema>

// the shape of config/models.json
export const modelConfigSchema = z.object({
  reviewModelId: modelIdSchema,
  summarizeModelId: modelIdSchema,
  prices: modelPricesSchema,
})
export type ModelConfig = z.infer<typeof modelConfigSchema>

// config/models.json at the repository root
export const defaultModelConfigPath = join(
  import.meta.dir,
  '..',
  '..',
  'config',
  'models.json',
)

// a model id split into its provider and the provider's model name
export interface ParsedModelId {
  provider: ModelProvider
  modelName: string
}

/**
 * Reads and validates the model config file, which may contain comments.
 */
export async function readModelConfig(
  configPath: string = defaultModelConfigPath,
): Promise<ModelConfig> {
  // parse the file as JSON with comments
  const configText = await Bun.file(configPath).text()
  const parseErrors: ParseError[] = []
  const configValue: unknown = parseJsonc(configText, parseErrors)
  if (parseErrors.length > 0) {
    throw new Error(`model config ${configPath} is not valid JSON`)
  }

  // validate the parsed value
  const modelConfigResult = modelConfigSchema.safeParse(configValue)
  if (!modelConfigResult.success) {
    throw new Error(
      `model config ${configPath} is invalid: ${modelConfigResult.error.message}`,
    )
  }
  return modelConfigResult.data
}

/**
 * Splits a model id into its provider and model name, and throws on an unknown provider.
 */
export function parseModelId(modelId: string): ParsedModelId {
  // reject an id without a known provider prefix
  const modelIdMatch = modelIdPattern.exec(modelId)
  if (!modelIdMatch) {
    throw new Error(
      `model id ${modelId} must start with ${modelProviders.map((provider) => `${provider}/`).join(' or ')}`,
    )
  }

  // split at the first slash
  return {
    provider: modelIdMatch[1] as ModelProvider,
    modelName: modelIdMatch[2] as string,
  }
}
