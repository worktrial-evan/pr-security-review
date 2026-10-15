// the JSONL audit sink: appends one redacted audit event per line to <runsDir>/<runId>/audit.jsonl and fsyncs every write.
// appending goes through node:fs on purpose. Bun.file(path).writer() has no append mode and would truncate an existing log
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditEvent, AuditSink } from '@/shared/audit'
import { redact } from './redact'

// the run the sink writes for and the directory the run directories live in
export interface JsonlAuditSinkOptions {
  runId: string
  runsDir?: string
}

// the name of the audit log inside a run directory
const auditLogFileName = 'audit.jsonl'

/**
 * Appends redacted audit events as JSON lines to the audit log of one run, flushed to disk on every write.
 */
export class JsonlAuditSink implements AuditSink {
  // the path of the audit log this sink appends to
  readonly filePath: string

  // the open descriptor of the audit log, closed by dispose
  private readonly fileDescriptor: number
  private isDisposed = false

  constructor({ runId, runsDir = 'runs' }: JsonlAuditSinkOptions) {
    // create the run directory and open the log once for appending
    const runDir = join(runsDir, runId)
    mkdirSync(runDir, { recursive: true })
    this.filePath = join(runDir, auditLogFileName)
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
