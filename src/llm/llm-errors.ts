// the typed error the llm client throws when the model output fails the caller's schema twice
import type { LlmUsage } from '@/shared/llm'

// what failed validation, on which prompt and model
export interface LlmOutputValidationErrorOptions {
  promptId: string
  modelId: string
  validationMessage: string
  rawOutput: unknown
  usage: LlmUsage
}

/**
 * Reports model output that failed the caller's schema on the first attempt and on the retry.
 */
export class LlmOutputValidationError extends Error {
  readonly promptId: string
  readonly modelId: string
  readonly validationMessage: string
  readonly rawOutput: unknown
  readonly usage: LlmUsage

  constructor({
    promptId,
    modelId,
    validationMessage,
    rawOutput,
    usage,
  }: LlmOutputValidationErrorOptions) {
    super(
      `llm output for prompt ${promptId} on model ${modelId} failed validation twice: ${validationMessage}`,
    )
    this.name = 'LlmOutputValidationError'
    this.promptId = promptId
    this.modelId = modelId
    this.validationMessage = validationMessage
    this.rawOutput = rawOutput
    this.usage = usage
  }
}
