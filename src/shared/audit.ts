// the audit contract: the audit event written for every step, call and finding of a run, and the AuditSink interface that stores them
import { z } from 'zod'

// what an audit event records
export const auditEventKinds = [
  'step-start',
  'step-end',
  'step-error',
  'llm-call',
  'finding',
  'note',
] as const
export const auditEventKindSchema = z.enum(auditEventKinds)
export type AuditEventKind = z.infer<typeof auditEventKindSchema>

// one line of the audit log. durationMs and costUsd are set where the kind has them
export const auditEventSchema = z.object({
  timestamp: z.iso.datetime({ offset: true }),
  runId: z.string(),
  step: z.string(),
  kind: auditEventKindSchema,
  payload: z.record(z.string(), z.unknown()),
  durationMs: z.number().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
})
export type AuditEvent = z.infer<typeof auditEventSchema>

// where audit events go. write resolves once the event is stored
export interface AuditSink {
  write(event: AuditEvent): Promise<void>
}
