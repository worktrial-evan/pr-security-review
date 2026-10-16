// tests how the review handles the model's answers against the fake provider: injection attempts as notes with their count, the grounding drops with their notes, dedupe across two chunks and within one, and a chunk skipped after a schema failure
import { describe, expect, test } from 'bun:test'
import {
  buildLargeChangedFile,
  sqlInjectionChangedFile,
  wideContextChangedFile,
} from './fixtures/changed-files'
import { sqlInjectionModelFinding } from './fixtures/model-findings'
import {
  assemblePacket,
  buildOutputReply,
  findFindingEvents,
  findNotePayloads,
  readAddedLineText,
  runReview,
} from './fixtures/review-harness'
import type { ModelFinding } from './model-output'

// an answer that fails the output schema
const invalidOutput = { findings: 'none', injectionAttempts: [] }

// the large route file whose eight hunks of 100 lines pack into two chunks at the default limit
const largeChangedFile = buildLargeChangedFile({
  hunkCount: 8,
  linesPerHunk: 100,
})

// where the two chunks of the large route file meet: hunk 5 ends on head line 540 and hunk 6 starts on head line 551, after the gap of ten
const chunkOneLastHeadLine = 540
const chunkTwoFirstHeadLine = 551

// a finding on the first route of the large route file, with its range and confidence replaced per chunk
const routeFinding: ModelFinding = {
  ...sqlInjectionModelFinding,
  cwe: 'CWE-862',
  title: 'Item routes registered without an authorization check',
  severity: 'medium',
  confidence: 0.6,
  file: largeChangedFile.path,
  startLine: 1,
  endLine: 1,
  evidence: [readAddedLineText(largeChangedFile, 0)],
  sourceToSink:
    'any caller reaches listItems through the item routes without an authorization check',
  remediation: 'add the authorization middleware to the item routes',
}

// a finding field change that grounding rejects, with the reason it reports
const groundingRejectionCases: [string, Partial<ModelFinding>, string][] = [
  [
    'a range on context lines only as range-not-added',
    { startLine: 12, endLine: 13 },
    'range-not-added',
  ],
  [
    'a cwe outside the allowlist as cwe-not-allowed',
    { cwe: 'CWE-9999' },
    'cwe-not-allowed',
  ],
  [
    'another file as file-mismatch',
    { file: 'src/users/other.ts' },
    'file-mismatch',
  ],
]

// return the text of the line the large route file adds at a head line
function readRouteLineText(headLine: number): string {
  const routeLine = largeChangedFile.addedLines.find(
    (addedLine) => addedLine.line === headLine,
  )
  if (routeLine === undefined) {
    throw new Error(
      `the large route file adds no line at head line ${headLine}`,
    )
  }
  return routeLine.text
}

describe('reviewCode injection attempts', () => {
  test('writes one note per reported attempt with its file and line, and counts them', async () => {
    const { codeReviewResult, auditSink } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [
        buildOutputReply({
          injectionAttempts: [
            { file: sqlInjectionChangedFile.path, line: 14 },
            { file: sqlInjectionChangedFile.path, line: 15 },
          ],
        }),
      ],
    })

    expect(codeReviewResult.injectionAttemptCount).toBe(2)
    expect(codeReviewResult.findings).toEqual([])
    expect(findNotePayloads(auditSink, 'injection attempt')).toEqual([
      {
        message: 'injection attempt',
        file: 'src/users/find-user.ts',
        line: 14,
      },
      {
        message: 'injection attempt',
        file: 'src/users/find-user.ts',
        line: 15,
      },
    ])
  })
})

describe('reviewCode grounding', () => {
  test('drops a finding whose evidence is a fabricated line, with a note and the count', async () => {
    const fabricatedFinding: ModelFinding = {
      ...sqlInjectionModelFinding,
      evidence: ['  database.query("DROP TABLE users")'],
    }

    const { codeReviewResult, auditSink } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [fabricatedFinding] })],
    })

    expect(codeReviewResult.findings).toEqual([])
    expect(codeReviewResult.groundingRejectionCount).toBe(1)
    expect(
      findNotePayloads(auditSink, 'finding rejected by grounding'),
    ).toEqual([
      {
        message: 'finding rejected by grounding',
        reason: 'evidence-not-added',
        file: 'src/users/find-user.ts',
        cwe: 'CWE-89',
        title: fabricatedFinding.title,
        startLine: 15,
        endLine: 15,
        chunkFile: 'src/users/find-user.ts',
        chunkNumber: 1,
      },
    ])
    expect(findFindingEvents(auditSink)).toEqual([])
  })

  test.each(groundingRejectionCases)(
    'drops a finding with %s',
    async (_description, overrides, reason) => {
      const rejectedFinding: ModelFinding = {
        ...sqlInjectionModelFinding,
        ...overrides,
      }

      const { codeReviewResult, auditSink } = await runReview({
        changedFiles: [sqlInjectionChangedFile],
        replies: [buildOutputReply({ findings: [rejectedFinding] })],
      })

      expect(codeReviewResult.findings).toEqual([])
      expect(codeReviewResult.groundingRejectionCount).toBe(1)

      // one note names the reason, where the finding pointed and the chunk it answered
      const groundingNotes = findNotePayloads(
        auditSink,
        'finding rejected by grounding',
      )
      expect(groundingNotes).toHaveLength(1)
      expect(groundingNotes[0]).toMatchObject({
        reason,
        file: rejectedFinding.file,
        cwe: rejectedFinding.cwe,
        startLine: rejectedFinding.startLine,
        endLine: rejectedFinding.endLine,
        chunkFile: sqlInjectionChangedFile.path,
        chunkNumber: 1,
      })
    },
  )

  test('keeps a finding whose evidence and range are added lines and whose cwe is allowed', async () => {
    const { codeReviewResult, auditSink } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })

    expect(codeReviewResult.findings).toHaveLength(1)
    expect(codeReviewResult.groundingRejectionCount).toBe(0)
    expect(
      findNotePayloads(auditSink, 'finding rejected by grounding'),
    ).toEqual([])
  })
})

describe('reviewCode dedupe', () => {
  test('collapses the same cwe on overlapping ranges reported by two chunks into the higher confidence', async () => {
    // the packet splits at the gap: chunk 1 ends on head line 540 and chunk 2 starts on head line 551
    const packet = assemblePacket({ changedFiles: [largeChangedFile] })
    expect(packet.chunks).toHaveLength(2)
    expect(packet.chunks[0]?.text).toEndWith(
      `${chunkOneLastHeadLine} + ${readRouteLineText(chunkOneLastHeadLine)}`,
    )
    expect(packet.chunks[1]?.text).toContain(
      `@@ +${chunkTwoFirstHeadLine},100 @@\n${chunkTwoFirstHeadLine} + `,
    )

    // chunk 1 reports a range from its last route across the gap to the first route of chunk 2, and chunk 2 reports that route with more confidence. each finding's evidence is a line of its own chunk
    const weakFinding: ModelFinding = {
      ...routeFinding,
      startLine: chunkOneLastHeadLine,
      endLine: chunkTwoFirstHeadLine,
      evidence: [readRouteLineText(chunkOneLastHeadLine)],
      confidence: 0.6,
    }
    const strongFinding: ModelFinding = {
      ...routeFinding,
      startLine: chunkTwoFirstHeadLine,
      endLine: chunkTwoFirstHeadLine + 1,
      evidence: [readRouteLineText(chunkTwoFirstHeadLine)],
      confidence: 0.9,
    }

    const { codeReviewResult, provider } = await runReview({
      changedFiles: [largeChangedFile],
      replies: [
        buildOutputReply({ findings: [weakFinding] }),
        buildOutputReply({ findings: [strongFinding] }),
      ],
    })

    expect(provider.requests).toHaveLength(2)
    expect(codeReviewResult.groundingRejectionCount).toBe(0)
    expect(codeReviewResult.findings).toHaveLength(1)
    expect(codeReviewResult.findings[0]).toMatchObject({
      file: 'src/api/routes.ts',
      cwe: 'CWE-862',
      confidence: 0.9,
      startLine: chunkTwoFirstHeadLine,
      endLine: chunkTwoFirstHeadLine + 1,
    })
  })

  test('keeps two findings on the same range that differ in cwe, ordered by cwe', async () => {
    const inputValidationFinding: ModelFinding = {
      ...sqlInjectionModelFinding,
      cwe: 'CWE-20',
      title: 'Unvalidated id query parameter',
    }

    const { codeReviewResult } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [
        buildOutputReply({
          findings: [sqlInjectionModelFinding, inputValidationFinding],
        }),
      ],
    })

    expect(codeReviewResult.findings.map((finding) => finding.cwe)).toEqual([
      'CWE-20',
      'CWE-89',
    ])
  })
})

describe('reviewCode output validation failure', () => {
  test('skips the chunk whose answer fails the schema twice, notes it and keeps the findings of the other chunk', async () => {
    // the settings file packs first, so its two failing answers come before the valid one
    const changedFiles = [sqlInjectionChangedFile, wideContextChangedFile]

    const { codeReviewResult, provider, auditSink } = await runReview({
      changedFiles,
      replies: [
        { kind: 'output', output: invalidOutput },
        { kind: 'output', output: invalidOutput },
        buildOutputReply({ findings: [sqlInjectionModelFinding] }),
      ],
    })

    // the attempt, the retry and the other chunk's call
    expect(provider.requests).toHaveLength(3)
    expect(codeReviewResult.failedChunkCount).toBe(1)
    expect(codeReviewResult.findings).toHaveLength(1)
    expect(codeReviewResult.findings[0]).toMatchObject({
      file: 'src/users/find-user.ts',
      cwe: 'CWE-89',
    })

    // one note names the skipped chunk and the error
    const failedChunkNotes = findNotePayloads(
      auditSink,
      'chunk skipped after output validation failure',
    )
    expect(failedChunkNotes).toHaveLength(1)
    expect(failedChunkNotes[0]).toMatchObject({
      file: 'src/config/load-settings.ts',
      chunkNumber: 1,
    })
    expect(String(failedChunkNotes[0]?.error)).toContain(
      'failed validation twice',
    )
  })
})
