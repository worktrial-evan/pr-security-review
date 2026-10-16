// an audit sink that keeps every event in memory
import type { AuditEvent, AuditSink } from '@/shared/audit'

// an audit sink whose events stay readable in write order
export interface MemoryAuditSink extends AuditSink {
  events: AuditEvent[]
}

/**
 * Creates an audit sink that appends every written event to its events array.
 */
export function createMemoryAuditSink(): MemoryAuditSink {
  const events: AuditEvent[] = []

  // append each event as it is written
  async function write(event: AuditEvent): Promise<void> {
    events.push(event)
  }

  return { events, write }
}
