// opens the JSONL audit log of one run under a runs directory. it serves callers that may not import the audit module
import { JsonlAuditSink } from '@/audit/jsonl-audit-sink'
import type { AuditSink } from '@/shared/audit'

// an audit sink with the path of its log and a way to close it
export interface RunAuditLog extends AuditSink {
  readonly filePath: string
  dispose(): void
}

// the run the log belongs to and the directory that holds every run
export interface OpenRunAuditLogOptions {
  runId: string
  runsDirectory: string
}

/**
 * Opens the redacting audit log at <runsDirectory>/<runId>/audit.jsonl.
 */
export function openRunAuditLog({
  runId,
  runsDirectory,
}: OpenRunAuditLogOptions): RunAuditLog {
  return new JsonlAuditSink({ runId, runsDirectory: runsDirectory })
}
