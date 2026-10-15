// builds and writes the llm-call audit event that records every generate call, successful or failed
import { createHash } from 'node:crypto'
import type { AuditSink } from '@/shared/audit'
import type { LlmGenerateOptions, LlmUsage } from '@/shared/llm'
import { computeCostUsd } from './llm-cost'
import { LlmOutputValidationError } from './llm-errors'
import type { ModelPrices } from './model-config'

// the audit step name of every llm call
const llmAuditStep = 'llm'

// what the audit event records about the call's result. a failure has usage only when tokens were spent
export type LlmCallRecord =
  | {
      status: 'success'
      rawOutput: unknown
      usage: LlmUsage
      costUsd: number | null
      isCacheHit: boolean
    }
  | {
      status: 'failed'
      error: string
      rawOutput: unknown
      usage: LlmUsage | null
      costUsd: number | null
      isCacheHit: false
    }

// the failed call to describe and the prices to cost it with
export interface ToFailedLlmCallRecordOptions {
  error: unknown
  modelId: string
  prices: ModelPrices
}

// the prompt and texts of the call, which the event names and hashes
export type LlmCallIdentity = Pick<
  LlmGenerateOptions<unknown>,
  'promptId' | 'promptVersion' | 'promptHash' | 'system' | 'user'
>

// the finished call to audit and where to write it
export interface WriteLlmCallEventOptions {
  auditSink: AuditSink
  runId: string
  modelId: string
  llmCallIdentity: LlmCallIdentity
  durationMs: number
  llmCallRecord: LlmCallRecord
}

/**
 * Describes a failed call, keeping the raw output and usage of a validation failure.
 */
export function toFailedLlmCallRecord({
  error,
  modelId,
  prices,
}: ToFailedLlmCallRecordOptions): LlmCallRecord {
  // a validation failure spent tokens and has the output that failed
  if (error instanceof LlmOutputValidationError) {
    const costUsd = computeCostUsd({ modelId, usage: error.usage, prices })
    return {
      status: 'failed',
      error: error.message,
      rawOutput: error.rawOutput,
      usage: error.usage,
      costUsd,
      isCacheHit: false,
    }
  }

  // any other failure has no output and no known usage
  return {
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    rawOutput: null,
    usage: null,
    costUsd: null,
    isCacheHit: false,
  }
}

/**
 * Writes the llm-call audit event for one generate call.
 */
export async function writeLlmCallEvent({
  auditSink,
  runId,
  modelId,
  llmCallIdentity,
  durationMs,
  llmCallRecord,
}: WriteLlmCallEventOptions): Promise<void> {
  // hash the texts sent to the model
  const inputHash = createHash('sha256')
    .update(JSON.stringify([llmCallIdentity.system, llmCallIdentity.user]))
    .digest('hex')

  // write the event, with the top level cost only when the call is priced
  await auditSink.write({
    timestamp: new Date().toISOString(),
    runId,
    step: llmAuditStep,
    kind: 'llm-call',
    payload: {
      modelId,
      promptId: llmCallIdentity.promptId,
      promptVersion: llmCallIdentity.promptVersion,
      promptHash: llmCallIdentity.promptHash,
      inputHash,
      durationMs,
      ...llmCallRecord,
    },
    durationMs,
    ...(llmCallRecord.costUsd === null
      ? {}
      : { costUsd: llmCallRecord.costUsd }),
  })
}
