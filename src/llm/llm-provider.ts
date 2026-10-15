// the boundary between the llm client and a model provider: one request in, raw JSON and token usage out
import type { LlmUsage } from '@/shared/llm'

// one request to a model. outputJsonSchema is the JSON schema form of the caller's zod schema
export interface LlmProviderRequest {
  modelId: string
  promptId: string
  system: string
  user: string
  outputJsonSchema: Record<string, unknown>
}

// the model's parsed JSON before validation, and the tokens the request consumed
export interface LlmProviderResponse {
  rawOutput: unknown
  usage: LlmUsage
}

// a model provider. generate throws LlmHttpError when the provider answers with an http error
export interface LlmProvider {
  generate(request: LlmProviderRequest): Promise<LlmProviderResponse>
}

// the status code and message of a failed provider request
export interface LlmHttpErrorOptions {
  statusCode: number
  message: string
  cause?: unknown
}

/**
 * Reports a provider request that failed with an http status code.
 */
export class LlmHttpError extends Error {
  readonly statusCode: number

  constructor({ statusCode, message, cause }: LlmHttpErrorOptions) {
    super(`llm provider answered ${statusCode}: ${message}`, { cause })
    this.name = 'LlmHttpError'
    this.statusCode = statusCode
  }
}
