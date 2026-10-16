// the cancellation of one review run. the caller cancels with a signal name and the run answers by failing itself with one last note
import { advanceRunState } from '@/run-state/run-state'
import type { AuditEvent, AuditSink } from '@/shared/audit'
import type { RunRecord } from './run-record'

// what a listener does with the signal that cancelled the run
export type CancelListener = (signal: string) => Promise<void>

// a cancellation the run listens to. cancelledBy is the signal once cancel was called
export interface RunCancellation {
  readonly cancelledBy: string | undefined
  onCancel(listener: CancelListener): void
  cancel(signal: string): Promise<void>
}

/**
 * Creates a cancellation whose cancel runs the listeners in registration order once and resolves when all have.
 */
export function createRunCancellation(): RunCancellation {
  const listeners: CancelListener[] = []
  let cancelledBy: string | undefined
  return {
    get cancelledBy() {
      return cancelledBy
    },
    onCancel(listener) {
      listeners.push(listener)
    },
    async cancel(signal) {
      // a second cancel does nothing
      if (cancelledBy !== undefined) {
        return
      }

      // remember the signal and run every listener in order
      cancelledBy = signal
      for (const listener of listeners) {
        await listener(signal)
      }
    },
  }
}

// an audit sink that forwards every event until it is closed. a closed sink resolves without storing
export interface ClosableAuditSink extends AuditSink {
  close(): void
}

/**
 * Wraps an audit sink so every event from one moment on can be dropped.
 */
export function createClosableAuditSink(
  auditSink: AuditSink,
): ClosableAuditSink {
  let isClosed = false
  return {
    async write(event: AuditEvent): Promise<void> {
      if (isClosed) {
        return
      }
      await auditSink.write(event)
    },
    close() {
      isClosed = true
    },
  }
}

// the record to cancel and the signal. also the record's closable sink and the caller's sink under it
export interface CancelReviewRunOptions {
  runRecord: RunRecord
  signal: string
  runAuditSink: ClosableAuditSink
  auditSink: AuditSink
}

/**
 * Fails a running record with the error "cancelled by <signal>", writes the cancel note as its last event and drops everything after. A run that already ended writes nothing.
 */
export async function cancelReviewRun({
  runRecord,
  signal,
  runAuditSink,
  auditSink,
}: CancelReviewRunOptions): Promise<void> {
  // a run that already ended writes nothing
  const { stage } = runRecord.runState
  if (stage === 'done' || stage === 'failed') {
    return
  }

  // start no later step and drop every later event
  runRecord.cancelledBy = signal
  runAuditSink.close()

  // fail the run and write the cancel note through the caller's sink. nothing else reaches it after the close
  runRecord.runState = advanceRunState({
    state: runRecord.runState,
    to: 'failed',
    error: { message: `cancelled by ${signal}` },
    now: runRecord.now(),
  })
  await auditSink.write({
    timestamp: runRecord.now().toISOString(),
    runId: runRecord.runId,
    step: 'run',
    kind: 'note',
    payload: { message: 'run cancelled', status: 'cancelled', signal, stage },
  })
}
