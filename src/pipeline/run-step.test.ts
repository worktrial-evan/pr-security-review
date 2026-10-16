// tests runStep over the audited success path and both failure paths. also tests the stage moves
import { describe, expect, test } from 'bun:test'
import {
  createMemoryAuditSink,
  type MemoryAuditSink,
  makeTestClock,
} from './pipeline-fixtures'
import { createRunRecord, type RunRecord } from './run-record'
import { advanceToStage, ReviewAbortedError, runStep } from './run-step'
import { hashValue } from './stable-hash'

// a fresh run record over an in-memory sink
function createTestRunRecord(): {
  runRecord: RunRecord
  auditSink: MemoryAuditSink
} {
  const auditSink = createMemoryAuditSink()
  const runRecord = createRunRecord({
    runId: 'test-run',
    auditSink,
    now: makeTestClock(),
  })
  return { runRecord, auditSink }
}

describe('runStep', () => {
  test('audits the start and end with hashes and records the duration', async () => {
    const { runRecord, auditSink } = createTestRunRecord()
    const output = await runStep({
      runRecord,
      step: 'collect-files',
      input: { count: 2 },
      run: async ({ count }) => count * 2,
      isFatal: true,
    })

    // the output comes back and the run moved to the step's stage
    expect(output).toBe(4)
    expect(runRecord.runState.stage).toBe('collecting-files')
    expect(runRecord.stepDurations['collect-files']).toBeGreaterThan(0)

    // the two events name the step and the stage and the hashes
    const [startEvent, endEvent] = auditSink.events
    expect(startEvent).toMatchObject({
      kind: 'step-start',
      step: 'collect-files',
      runId: 'test-run',
      payload: {
        stage: 'collecting-files',
        inputHash: hashValue({ count: 2 }),
      },
    })
    expect(endEvent).toMatchObject({
      kind: 'step-end',
      step: 'collect-files',
      payload: { stage: 'collecting-files', outputHash: hashValue(4) },
    })
    expect(endEvent?.durationMs).toBe(runRecord.stepDurations['collect-files'])
  })

  test('records a non-fatal failure as a degraded step and returns the fallback', async () => {
    const { runRecord, auditSink } = createTestRunRecord()
    const output = await runStep({
      runRecord,
      step: 'secrets',
      input: [],
      run: async (): Promise<string[]> => {
        throw new Error('scanner broke')
      },
      isFatal: false,
      fallback: ['fallback'],
    })

    // the fallback comes back with the error and the degraded step recorded
    expect(output).toEqual(['fallback'])
    expect(runRecord.errors).toEqual([
      { step: 'secrets', message: 'scanner broke', isFatal: false },
    ])
    expect(runRecord.degradedSteps).toEqual(['secrets: failed: scanner broke'])
    expect(auditSink.events.at(-1)).toMatchObject({
      kind: 'step-error',
      step: 'secrets',
      payload: { message: 'scanner broke', isFatal: false },
    })
  })

  test('throws ReviewAbortedError for a fatal failure', async () => {
    const { runRecord } = createTestRunRecord()
    const stepRun = runStep({
      runRecord,
      step: 'describe-pull-request',
      input: {},
      run: async () => {
        throw new Error('no such pull request')
      },
      isFatal: true,
    })

    // the error names the step and nothing is recorded as degraded
    await expect(stepRun).rejects.toBeInstanceOf(ReviewAbortedError)
    await expect(stepRun).rejects.toMatchObject({
      step: 'describe-pull-request',
      message: 'no such pull request',
    })
    expect(runRecord.degradedSteps).toEqual([])
  })
})

describe('advanceToStage', () => {
  test('passes through every stage in between', () => {
    const { runRecord } = createTestRunRecord()
    advanceToStage({ runRecord, stage: 'matching' })

    expect(runRecord.runState.stage).toBe('matching')
    expect(
      runRecord.runState.completedStages.map(({ stage }) => stage),
    ).toEqual([
      'resolving-pull-request',
      'collecting-files',
      'parsing-lockfiles',
    ])
  })

  test('stays put on the current stage and rejects an earlier one', () => {
    const { runRecord } = createTestRunRecord()
    advanceToStage({ runRecord, stage: 'secrets' })
    advanceToStage({ runRecord, stage: 'secrets' })

    expect(runRecord.runState.stage).toBe('secrets')
    expect(() => advanceToStage({ runRecord, stage: 'matching' })).toThrow(
      'cannot move the run from secrets to matching',
    )
  })
})
