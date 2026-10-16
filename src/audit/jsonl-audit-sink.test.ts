// tests for JsonlAuditSink: three events become three valid lines, a fake token is redacted on disk and each line is on disk once write resolves
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AuditEvent, auditEventSchema } from '@/shared/audit'
import { JsonlAuditSink } from './jsonl-audit-sink'

// the run every test writes for
const runId = 'run-20261015-083000'

// a made-up github token for the tests
const fakeGithubToken = 'ghp_FakeToken0123456789abcdefghijklmnopqrstuv'

// three events of one run, in the order they are written
const auditEventSamples: AuditEvent[] = [
  {
    timestamp: '2026-10-15T08:30:00.000Z',
    runId,
    step: 'resolving-pull-request',
    kind: 'step-start',
    payload: { file: 'package.json', packageName: 'lodash', line: 12 },
  },
  {
    timestamp: '2026-10-15T08:30:02.140Z',
    runId,
    step: 'code-review',
    kind: 'llm-call',
    payload: { promptId: 'code-review', inputTokens: 1200, outputTokens: 340 },
    durationMs: 2140,
    costUsd: 0.0087,
  },
  {
    timestamp: '2026-10-15T08:30:03.000Z',
    runId,
    step: 'code-review',
    kind: 'step-end',
    payload: { findingCount: 2 },
    durationMs: 3000,
  },
]

// a fresh runs directory outside the repository for every test
let temporaryRunsDirectory: string

beforeEach(() => {
  temporaryRunsDirectory = mkdtempSync(
    join(tmpdir(), 'pull-request-review-audit-'),
  )
})

afterEach(() => {
  rmSync(temporaryRunsDirectory, { recursive: true, force: true })
})

describe('JsonlAuditSink', () => {
  test('three events become three lines that each pass the audit contract', async () => {
    // write the three events through one sink
    const sink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    for (const auditEvent of auditEventSamples) {
      await sink.write(auditEvent)
    }
    sink.dispose()

    // expect exactly three lines, each parsing into a valid event equal to what was written
    const auditLines = await readAuditLines(sink)
    expect(auditLines).toHaveLength(3)
    const parsedAuditEvents = auditLines.map((auditLine) =>
      auditEventSchema.parse(JSON.parse(auditLine)),
    )
    expect(parsedAuditEvents).toEqual(auditEventSamples)
  })

  test('the run directory and the log file are created under runsDirectory', () => {
    // open a sink for a run whose directory does not exist yet
    const sink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    sink.dispose()

    // expect the directory and the empty log in place
    expect(sink.filePath).toBe(
      join(temporaryRunsDirectory, runId, 'audit.jsonl'),
    )
    expect(existsSync(join(temporaryRunsDirectory, runId))).toBe(true)
    expect(existsSync(sink.filePath)).toBe(true)
  })

  test('a run directory is used as given with no run id appended', () => {
    // open a sink over a run directory that does not exist yet
    const runDirectory = join(temporaryRunsDirectory, 'reports', 'one')
    const sink = new JsonlAuditSink({ runDirectory })
    sink.dispose()

    // expect the log directly inside that directory
    expect(sink.filePath).toBe(join(runDirectory, 'audit.jsonl'))
    expect(existsSync(sink.filePath)).toBe(true)
  })

  test('a fake token is redacted on disk', async () => {
    // write an event whose payload holds the token under an authorization header
    const sink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    await sink.write({
      timestamp: '2026-10-15T08:30:00.000Z',
      runId,
      step: 'resolving-pull-request',
      kind: 'note',
      payload: { headers: { authorization: `Bearer ${fakeGithubToken}` } },
    })
    sink.dispose()

    // expect the token gone from the file and a fingerprint in its place
    const auditText = await Bun.file(sink.filePath).text()
    expect(auditText).not.toContain(fakeGithubToken)
    expect(auditText).not.toContain('Bearer')
    const parsedAuditEvent = auditEventSchema.parse(JSON.parse(auditText))
    const headers = parsedAuditEvent.payload.headers as {
      authorization: string
    }
    expect(headers.authorization).toMatch(/^sha256:[0-9a-f]{16}$/)
  })

  test('the file ends with the event as soon as write resolves', async () => {
    // after each write, read the file back before writing the next event
    const sink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    for (const auditEvent of auditEventSamples) {
      await sink.write(auditEvent)
      const auditLines = await readAuditLines(sink)
      const lastAuditLine = auditLines[auditLines.length - 1]
      expect(lastAuditLine).toBeDefined()
      expect(JSON.parse(lastAuditLine ?? '')).toEqual(auditEvent)
    }
    sink.dispose()
  })

  test('a second sink appends to the log instead of truncating it', async () => {
    // write one event, close the sink, then write another through a new sink for the same run
    const firstSink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    await firstSink.write(auditEventSamples[0] as AuditEvent)
    firstSink.dispose()
    const secondSink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    await secondSink.write(auditEventSamples[1] as AuditEvent)
    secondSink.dispose()

    // expect both events in the file
    const auditLines = await readAuditLines(secondSink)
    expect(auditLines).toHaveLength(2)
  })

  test('dispose closes the descriptor and can be called twice', async () => {
    // close a sink twice and then try to write through it
    const sink = new JsonlAuditSink({
      runId,
      runsDirectory: temporaryRunsDirectory,
    })
    sink.dispose()
    sink.dispose()

    // expect the write to reject on the closed descriptor
    await expect(
      sink.write(auditEventSamples[0] as AuditEvent),
    ).rejects.toThrow()
  })
})

// read the audit log of a sink and split it into its lines
async function readAuditLines(sink: JsonlAuditSink): Promise<string[]> {
  const auditText = await Bun.file(sink.filePath).text()
  expect(auditText).toEndWith('\n')
  return auditText.slice(0, -1).split('\n')
}
