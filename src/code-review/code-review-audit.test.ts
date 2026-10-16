// tests the code review audit helpers: the memory sink keeps events in order, and both events parse through the audit contract with the code-review step, their kind and their payload
import { describe, expect, test } from 'bun:test'
import { auditEventSchema } from '@/shared/audit'
import { codeReviewFindingSample } from '@/shared/finding.samples'
import {
  codeReviewStep,
  writeCodeReviewFinding,
  writeCodeReviewNote,
} from './code-review-audit'
import { createMemoryAuditSink } from './fixtures/memory-audit-sink'

// the run every event is written under
const runId = 'run-audit-test'

describe('createMemoryAuditSink', () => {
  test('keeps every written event in write order', async () => {
    const auditSink = createMemoryAuditSink()

    // write a note and then a finding
    await writeCodeReviewNote({ auditSink, runId, payload: { message: 'one' } })
    await writeCodeReviewFinding({
      auditSink,
      runId,
      finding: codeReviewFindingSample,
    })

    expect(auditSink.events.map((event) => event.kind)).toEqual([
      'note',
      'finding',
    ])
  })
})

describe('codeReviewStep', () => {
  test('is code-review', () => {
    expect(codeReviewStep).toBe('code-review')
  })
})

describe('writeCodeReviewNote', () => {
  test('writes one note event under the code-review step that parses through the audit contract', async () => {
    const auditSink = createMemoryAuditSink()

    await writeCodeReviewNote({
      auditSink,
      runId,
      payload: { message: 'review packet assembled', chunkCount: 2 },
    })

    // exactly one event, valid against the contract
    expect(auditSink.events).toHaveLength(1)
    const noteEvent = auditEventSchema.parse(auditSink.events[0])
    expect(noteEvent.kind).toBe('note')
    expect(noteEvent.step).toBe('code-review')
    expect(noteEvent.runId).toBe(runId)
    expect(noteEvent.payload).toEqual({
      message: 'review packet assembled',
      chunkCount: 2,
    })
    expect(noteEvent.durationMs).toBeUndefined()
    expect(noteEvent.costUsd).toBeUndefined()
  })

  test('stamps the time the note was written', async () => {
    // a sink to write to and the time just before the write
    const auditSink = createMemoryAuditSink()
    const writeStartedAt = Date.now()

    await writeCodeReviewNote({ auditSink, runId, payload: { message: 'x' } })

    // the timestamp parses back to a time at or after the write started
    const noteTimestamp = Date.parse(auditSink.events[0]?.timestamp ?? '')
    expect(noteTimestamp).toBeGreaterThanOrEqual(writeStartedAt)
    expect(noteTimestamp).toBeLessThanOrEqual(Date.now())
  })
})

describe('writeCodeReviewFinding', () => {
  test('writes one finding event under the code-review step whose payload holds the finding', async () => {
    const auditSink = createMemoryAuditSink()

    await writeCodeReviewFinding({
      auditSink,
      runId,
      finding: codeReviewFindingSample,
    })

    // exactly one event, valid against the contract
    expect(auditSink.events).toHaveLength(1)
    const findingEvent = auditEventSchema.parse(auditSink.events[0])
    expect(findingEvent.kind).toBe('finding')
    expect(findingEvent.step).toBe('code-review')
    expect(findingEvent.runId).toBe(runId)
    expect(findingEvent.payload).toEqual({ finding: codeReviewFindingSample })

    // the event holds the finding passed in, not a copy
    expect(auditSink.events[0]?.payload.finding).toBe(codeReviewFindingSample)
  })
})
