// writes the code review audit events: a note for each step the review takes and a finding event for each finding it returns
import type { AuditEvent, AuditEventKind, AuditSink } from '@/shared/audit'
import type { CodeReviewFinding } from '@/shared/finding'

// the audit step every code review event is written under
export const codeReviewStep = 'code-review'

// where the events go and which run they belong to
export interface CodeReviewAuditContext {
  auditSink: AuditSink
  runId: string
}

// the note to write and where it goes
export interface WriteCodeReviewNoteOptions extends CodeReviewAuditContext {
  payload: Record<string, unknown>
}

// the finding to write and where it goes
export interface WriteCodeReviewFindingOptions extends CodeReviewAuditContext {
  finding: CodeReviewFinding
}

/**
 * Writes one note event under the code-review step with the given payload.
 */
export async function writeCodeReviewNote({
  auditSink,
  runId,
  payload,
}: WriteCodeReviewNoteOptions): Promise<void> {
  await auditSink.write(createCodeReviewEvent({ runId, kind: 'note', payload }))
}

/**
 * Writes one finding event under the code-review step with the finding as its payload.
 */
export async function writeCodeReviewFinding({
  auditSink,
  runId,
  finding,
}: WriteCodeReviewFindingOptions): Promise<void> {
  await auditSink.write(
    createCodeReviewEvent({ runId, kind: 'finding', payload: { finding } }),
  )
}

// the run, kind and payload of one event
interface CreateCodeReviewEventOptions {
  runId: string
  kind: AuditEventKind
  payload: Record<string, unknown>
}

// stamp the current time and the code-review step onto an event
function createCodeReviewEvent({
  runId,
  kind,
  payload,
}: CreateCodeReviewEventOptions): AuditEvent {
  return {
    timestamp: new Date().toISOString(),
    runId,
    step: codeReviewStep,
    kind,
    payload,
  }
}
