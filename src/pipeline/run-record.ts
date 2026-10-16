// the mutable record of one review run. it holds the run state and everything the steps add to the metadata
import { createRunState } from '@/run-state/run-state'
import type { AuditSink } from '@/shared/audit'
import type { StepError } from '@/shared/review'
import type { RunState } from '@/shared/run-state'
import type { CostMeter } from './metered-llm-client'

// everything the steps of one run add to as they go
export interface RunRecord {
  runId: string
  startedAt: string
  runState: RunState
  auditSink: AuditSink
  now: () => Date
  stepDurations: Record<string, number>
  errors: StepError[]
  degradedSteps: string[]
  promptVersions: Record<string, string>
  modelIds: Record<string, string>
  groundingRejectionCount: number
  suspectedPromptInjectionCount: number
  costMeter: CostMeter
}

// the run id and audit sink and clock a record starts with
export interface CreateRunRecordOptions {
  runId: string
  auditSink: AuditSink
  now: () => Date
}

/**
 * Creates the record of a run that has just started.
 */
export function createRunRecord({
  runId,
  auditSink,
  now,
}: CreateRunRecordOptions): RunRecord {
  const runState = createRunState({ runId, now: now() })
  return {
    runId,
    startedAt: runState.startedAt,
    runState,
    auditSink,
    now,
    stepDurations: {},
    errors: [],
    degradedSteps: [],
    promptVersions: {},
    modelIds: {},
    groundingRejectionCount: 0,
    suspectedPromptInjectionCount: 0,
    costMeter: { totalCostUsd: 0 },
  }
}

/**
 * Creates a run id from the start time and eight random hex characters.
 */
export function createRunId(startedAt: Date): string {
  // keep the digits of the time down to the second. then add a random suffix
  const timeDigits = startedAt.toISOString().replace(/\D/g, '').slice(0, 14)
  const randomSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `${timeDigits.slice(0, 8)}-${timeDigits.slice(8)}-${randomSuffix}`
}

// the record and the step that degraded with the reason
export interface AddDegradedStepOptions {
  runRecord: RunRecord
  step: string
  reason: string
}

/**
 * Lists a step as degraded with the reason, as one "step: reason" entry.
 */
export function addDegradedStep({
  runRecord,
  step,
  reason,
}: AddDegradedStepOptions): void {
  runRecord.degradedSteps.push(`${step}: ${reason}`)
}

// the record and the step a note belongs to with what it says
export interface WriteRunNoteOptions {
  runRecord: RunRecord
  step: string
  payload: Record<string, unknown>
}

/**
 * Writes one note event for the run under the given step.
 */
export async function writeRunNote({
  runRecord,
  step,
  payload,
}: WriteRunNoteOptions): Promise<void> {
  await runRecord.auditSink.write({
    timestamp: runRecord.now().toISOString(),
    runId: runRecord.runId,
    step,
    kind: 'note',
    payload,
  })
}
