// opens the JSONL audit log of one run in its run directory. it serves callers that may not import the audit module
import {
  JsonlAuditSink,
  type JsonlAuditSinkOptions,
} from '@/audit/jsonl-audit-sink'
import type { AuditSink } from '@/shared/audit'

// an audit sink with the path of its log and a way to close it
export interface RunAuditLog extends AuditSink {
  readonly filePath: string
  dispose(): void
}

// the run directory itself, or the run id and the directory that holds every run
export type OpenRunAuditLogOptions = JsonlAuditSinkOptions

/**
 * Opens the redacting audit log at <runDirectory>/audit.jsonl, with <runsDirectory>/<runId> as the run directory when the caller names none.
 */
export function openRunAuditLog(options: OpenRunAuditLogOptions): RunAuditLog {
  return new JsonlAuditSink(options)
}
