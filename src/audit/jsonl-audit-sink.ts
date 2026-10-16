// the JSONL audit sink: appends one redacted audit event per line to <runDirectory>/audit.jsonl and fsyncs every write.
// appending goes through node:fs on purpose. Bun.file(path).writer() has no append mode and would truncate an existing log
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditEvent, AuditSink } from '@/shared/audit'
import { redact } from './redact'

// where the log goes: the run directory itself, or the run's directory under the runs directory
export type JsonlAuditSinkOptions =
  | { runDirectory: string }
  | { runId: string; runsDirectory?: string }

// the name of the audit log inside a run directory
const auditLogFileName = 'audit.jsonl'

// the runs directory when the caller names none
const defaultRunsDirectory = 'runs'

/**
 * Appends redacted audit events as JSON lines to the audit log of one run, flushed to disk on every write.
 */
export class JsonlAuditSink implements AuditSink {
  // the path of the audit log this sink appends to
  readonly filePath: string

  // the open descriptor of the audit log, closed by dispose
  private readonly fileDescriptor: number
  private isDisposed = false

  constructor(options: JsonlAuditSinkOptions) {
    // create the run directory and open the log once for appending
    const runDirectory = resolveRunDirectory(options)
    mkdirSync(runDirectory, { recursive: true })
    this.filePath = join(runDirectory, auditLogFileName)
    this.fileDescriptor = openSync(this.filePath, 'a')
  }

  /**
   * Redacts the event, appends it as one JSON line and flushes the line to disk before resolving.
   */
  async write(event: AuditEvent): Promise<void> {
    // redact the event and append it as one line
    const redactedEvent = redact(event)
    const auditLine = `${JSON.stringify(redactedEvent)}\n`
    writeSync(this.fileDescriptor, auditLine)

    // flush the line to disk
    fsyncSync(this.fileDescriptor)
  }

  /**
   * Closes the audit log descriptor. A second call does nothing.
   */
  dispose(): void {
    // skip a descriptor that is already closed
    if (this.isDisposed) {
      return
    }

    // close the descriptor
    closeSync(this.fileDescriptor)
    this.isDisposed = true
  }
}

// the run directory the options name, or <runsDirectory>/<runId>
function resolveRunDirectory(options: JsonlAuditSinkOptions): string {
  if ('runDirectory' in options) {
    return options.runDirectory
  }
  return join(options.runsDirectory ?? defaultRunsDirectory, options.runId)
}
