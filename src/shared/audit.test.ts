// tests for the audit contract: an llm-call event with a cost round-trips and a bad kind is rejected
import { describe, expect, test } from 'bun:test'
import { type AuditEvent, auditEventSchema } from './audit'

// one model call recorded by the code-review step
const llmCallEventSample: AuditEvent = {
  timestamp: '2026-10-15T08:31:02.456Z',
  runId: 'run-20261015-083000',
  step: 'code-review',
  kind: 'llm-call',
  payload: {
    promptId: 'code-review',
    promptVersion: '1',
    inputTokens: 1200,
    outputTokens: 340,
    isCacheHit: false,
  },
  durationMs: 2140,
  costUsd: 0.0087,
}

describe('auditEventSchema', () => {
  test('an llm-call event with a cost round-trips', () => {
    // parse the event and read the cost back
    const parsedAuditEvent = auditEventSchema.parse(llmCallEventSample)
    expect(parsedAuditEvent).toEqual(llmCallEventSample)
    expect(parsedAuditEvent.costUsd).toBe(0.0087)
  })

  test('a kind outside the audit event kinds is rejected', () => {
    // give the event a kind outside the audit event kinds
    const badAuditEvent = { ...llmCallEventSample, kind: 'metric' }
    expect(() => auditEventSchema.parse(badAuditEvent)).toThrow(/kind/)
  })
})
