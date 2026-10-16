// tests the cancellation: listeners run in order once, the closable sink drops events after its close and a cancelled record ends with the note
import { describe, expect, test } from 'bun:test'
import { createMemoryAuditSink, makeTestClock } from './pipeline-fixtures'
import {
  cancelReviewRun,
  createClosableAuditSink,
  createRunCancellation,
} from './run-cancellation'
import { createRunRecord } from './run-record'
import { advanceToStage } from './run-step'

// the shape of one step event the sink tests write
const stepStartEvent = {
  timestamp: '2026-10-15T12:00:00.000Z',
  runId: 'test-run',
  step: 'secrets',
  kind: 'step-start' as const,
  payload: {},
}

describe('createRunCancellation', () => {
  test('runs the listeners in order once and remembers the signal', async () => {
    // two listeners that record the order they ran in
    const cancellation = createRunCancellation()
    const listenerRuns: string[] = []
    cancellation.onCancel(async (signal) => {
      listenerRuns.push(`first ${signal}`)
    })
    cancellation.onCancel(async (signal) => {
      listenerRuns.push(`second ${signal}`)
    })
    expect(cancellation.cancelledBy).toBeUndefined()

    // the first cancel runs both. the second does nothing
    await cancellation.cancel('SIGINT')
    await cancellation.cancel('SIGTERM')
    expect(listenerRuns).toEqual(['first SIGINT', 'second SIGINT'])
    expect(cancellation.cancelledBy).toBe('SIGINT')
  })
})

describe('createClosableAuditSink', () => {
  test('forwards events until it is closed', async () => {
    const auditSink = createMemoryAuditSink()
    const closableAuditSink = createClosableAuditSink(auditSink)

    // one event before the close reaches the sink. one after does not
    await closableAuditSink.write(stepStartEvent)
    closableAuditSink.close()
    await closableAuditSink.write({ ...stepStartEvent, step: 'code-review' })
    expect(auditSink.events.map((event) => event.step)).toEqual(['secrets'])
  })
})

describe('cancelReviewRun', () => {
  test('fails a running record and writes the cancel note as the last event', async () => {
    // a record at the secrets stage over a closable sink
    const auditSink = createMemoryAuditSink()
    const runAuditSink = createClosableAuditSink(auditSink)
    const runRecord = createRunRecord({
      runId: 'test-run',
      auditSink: runAuditSink,
      now: makeTestClock(),
    })
    advanceToStage({ runRecord, stage: 'secrets' })

    // the cancel fails the run with the signal and notes the stage reached
    await cancelReviewRun({
      runRecord,
      signal: 'SIGINT',
      runAuditSink,
      auditSink,
    })
    expect(runRecord.cancelledBy).toBe('SIGINT')
    expect(runRecord.runState).toMatchObject({
      stage: 'failed',
      error: { message: 'cancelled by SIGINT' },
    })
    expect(auditSink.events).toHaveLength(1)
    expect(auditSink.events[0]).toMatchObject({
      kind: 'note',
      step: 'run',
      runId: 'test-run',
      payload: {
        message: 'run cancelled',
        status: 'cancelled',
        signal: 'SIGINT',
        stage: 'secrets',
      },
    })

    // an event the record writes afterwards is dropped
    await runRecord.auditSink.write(stepStartEvent)
    expect(auditSink.events).toHaveLength(1)
  })

  test('writes nothing for a record that already ended', async () => {
    // a record that failed before the cancel
    const auditSink = createMemoryAuditSink()
    const runAuditSink = createClosableAuditSink(auditSink)
    const runRecord = createRunRecord({
      runId: 'test-run',
      auditSink: runAuditSink,
      now: makeTestClock(),
    })
    runRecord.runState = {
      ...runRecord.runState,
      stage: 'failed',
      error: { message: 'broke' },
    }

    await cancelReviewRun({
      runRecord,
      signal: 'SIGTERM',
      runAuditSink,
      auditSink,
    })
    expect(auditSink.events).toEqual([])
    expect(runRecord.cancelledBy).toBeUndefined()
  })
})
