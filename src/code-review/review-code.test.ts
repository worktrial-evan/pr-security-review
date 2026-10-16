// tests the review orchestration against the fake provider: the disabled run, one request per chunk in packet order with the chunk fenced, the fence described in the system turn, a provider error rethrown, a stop error keeping the finished chunks and listing the files left, the finding shape with its provenance and the audit trail

import { describe, expect, test } from 'bun:test'
import type { FakeLlmProvider } from '@/llm/fake-llm-provider'
import { LlmHttpError } from '@/llm/llm-provider'
import { describeFence, fenceUntrustedContent } from '@/prompts/fence-untrusted'
import { auditEventSchema } from '@/shared/audit'
import { createFindingId } from '@/shared/finding'
import {
  buildLargeChangedFile,
  lockfileChangedFile,
  renamedChangedFile,
  sqlInjectionChangedFile,
  wideContextChangedFile,
} from './fixtures/changed-files'
import { readFencedContent } from './fixtures/fenced-content'
import { sqlInjectionModelFinding } from './fixtures/model-findings'
import {
  assemblePacket,
  buildOutputReply,
  defaultClientModelId,
  defaultReviewModelId,
  emptyOutputReply,
  findCodeReviewEvents,
  findFindingEvents,
  findNotePayloads,
  readAddedLineText,
  reviewRunId,
  runReview,
} from './fixtures/review-harness'
import type { PacketChunk, ReviewPacket } from './review-packet'
import { codeReviewFenceLabel } from './review-prompt'

// the shape of a finding id: 16 lowercase hex characters
const findingIdPattern = /^[0-9a-f]{16}$/

// return the chunk at a position of a packet
function readChunk(packet: ReviewPacket, index: number): PacketChunk {
  const chunk = packet.chunks[index]
  if (chunk === undefined) {
    throw new Error(`packet has no chunk at index ${index}`)
  }
  return chunk
}

// assert one request per packet chunk in order, each with its chunk fenced as the user turn under the review prompt and model
function expectRequestsInChunkOrder(
  provider: FakeLlmProvider,
  packet: ReviewPacket,
): void {
  expect(provider.requests).toHaveLength(packet.chunks.length)
  for (const [index, chunk] of packet.chunks.entries()) {
    const fence = fenceUntrustedContent({
      label: codeReviewFenceLabel,
      content: chunk.text,
    })
    expect(provider.requests[index]?.user).toBe(fence.text)
    expect(provider.requests[index]?.user).toContain(`file: ${chunk.file}`)
    expect(provider.requests[index]?.promptId).toBe('code-review')
    expect(provider.requests[index]?.modelId).toBe(defaultReviewModelId)
  }
}

describe('reviewCode when the llm is disabled', () => {
  test('sends no request, returns no findings with every count 0 and writes one skip note', async () => {
    const { codeReviewResult, provider, auditSink } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [],
      isLlmEnabled: false,
    })

    expect(codeReviewResult).toEqual({
      findings: [],
      groundingRejectionCount: 0,
      injectionAttemptCount: 0,
      failedChunkCount: 0,
      unreviewedFiles: [],
      promptVersion: '1',
    })
    expect(provider.requests).toHaveLength(0)
    expect(auditSink.events).toHaveLength(1)
    expect(auditSink.events[0]).toMatchObject({
      runId: reviewRunId,
      step: 'code-review',
      kind: 'note',
      payload: { message: 'code review skipped because the llm is disabled' },
    })
  })
})

describe('reviewCode requests', () => {
  test('sends one request per chunk, in packet order, each holding its chunk fenced', async () => {
    // three files given out of path order
    const changedFiles = [
      sqlInjectionChangedFile,
      wideContextChangedFile,
      renamedChangedFile,
    ]
    const packet = assemblePacket({ changedFiles })

    const { provider } = await runReview({
      changedFiles,
      replies: [emptyOutputReply],
    })

    expect(packet.chunks.map((chunk) => chunk.file)).toEqual([
      'src/config/load-settings.ts',
      'src/http/parse-request.ts',
      'src/users/find-user.ts',
    ])
    expect(provider.requests).toHaveLength(3)
    expectRequestsInChunkOrder(provider, packet)
  })

  test('sends three requests in chunk order for one file split into three chunks', async () => {
    // three hunks of 100 lines split into three chunks at a limit of 100
    const largeChangedFile = buildLargeChangedFile({
      hunkCount: 3,
      linesPerHunk: 100,
    })
    const packet = assemblePacket({
      changedFiles: [largeChangedFile],
      maxChunkLines: 100,
    })
    expect(packet.chunks.map((chunk) => chunk.chunkNumber)).toEqual([1, 2, 3])

    const { provider } = await runReview({
      changedFiles: [largeChangedFile],
      replies: [emptyOutputReply],
      maxChunkLines: 100,
    })

    expect(provider.requests).toHaveLength(3)
    expectRequestsInChunkOrder(provider, packet)
  })

  test('sends the chunk text fenced as the user turn and describes the fence in the system turn', async () => {
    // the one chunk of the packet and the fence the review wraps it in
    const packet = assemblePacket({ changedFiles: [sqlInjectionChangedFile] })
    const chunk = readChunk(packet, 0)
    const fence = fenceUntrustedContent({
      label: codeReviewFenceLabel,
      content: chunk.text,
    })

    const { provider } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [emptyOutputReply],
    })

    // the user turn is the fence text with the chunk inside it byte for byte
    const request = provider.requests[0]
    expect(request?.user).toBe(fence.text)
    expect(
      readFencedContent({
        text: request?.user ?? '',
        openTag: fence.openTag,
        closeTag: fence.closeTag,
      }),
    ).toBe(chunk.text)

    // the system turn describes that fence
    expect(request?.system).toContain(describeFence(fence))
    expect(request?.system).toContain(fence.openTag)
    expect(request?.system).toContain(fence.closeTag)
  })

  test('rethrows a provider error that is not a validation failure', async () => {
    const reviewRun = runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [{ kind: 'http-error', statusCode: 400 }],
    })

    await expect(reviewRun).rejects.toBeInstanceOf(LlmHttpError)
  })

  test('stops at an error the predicate accepts, keeps the finished chunks and lists the files left', async () => {
    // the route file packs into two chunks before the users file. its first chunk answers with a finding and its second chunk fails
    const largeChangedFile = buildLargeChangedFile({
      hunkCount: 8,
      linesPerHunk: 100,
    })
    const routeFinding = {
      ...sqlInjectionModelFinding,
      vulnerabilityType: 'CWE-862',
      file: largeChangedFile.path,
      startLine: 1,
      endLine: 1,
      evidence: [readAddedLineText(largeChangedFile, 0)],
    }
    const { codeReviewResult, provider, auditSink } = await runReview({
      changedFiles: [largeChangedFile, sqlInjectionChangedFile],
      replies: [
        buildOutputReply({ findings: [routeFinding] }),
        { kind: 'http-error', statusCode: 400 },
      ],
      isStopError: (error) => error instanceof LlmHttpError,
    })

    // the users file was never asked. the route file's finding is kept and both files are listed once
    expect(provider.requests).toHaveLength(2)
    expect(codeReviewResult.findings).toHaveLength(1)
    expect(codeReviewResult.findings[0]).toMatchObject({
      file: largeChangedFile.path,
      vulnerabilityType: 'CWE-862',
    })
    expect(codeReviewResult.unreviewedFiles).toEqual([
      largeChangedFile.path,
      sqlInjectionChangedFile.path,
    ])
    expect(
      findNotePayloads(auditSink, 'review stopped before the chunk'),
    ).toEqual([
      {
        message: 'review stopped before the chunk',
        file: largeChangedFile.path,
        chunkNumber: 2,
        error: 'llm provider answered 400: fake provider error',
      },
    ])
  })

  test('lists no unreviewed file when every chunk was asked', async () => {
    const { codeReviewResult } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [emptyOutputReply],
      isStopError: (error) => error instanceof LlmHttpError,
    })

    expect(codeReviewResult.unreviewedFiles).toEqual([])
  })
})

describe('reviewCode finding shape', () => {
  test('returns the grounded finding with the detector, the provenance and a 16 hex id', async () => {
    const { codeReviewResult } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })

    // the one finding includes the detector, the provenance and the copied fields
    expect(codeReviewResult.findings).toHaveLength(1)
    const finding = codeReviewResult.findings[0]
    expect(finding).toMatchObject({
      detector: 'code-review',
      severity: 'high',
      confidence: 0.95,
      title: sqlInjectionModelFinding.title,
      file: 'src/users/find-user.ts',
      startLine: 15,
      endLine: 15,
      isIntroducedByPullRequest: true,
      remediation: sqlInjectionModelFinding.remediation,
      vulnerabilityType: 'CWE-89',
      evidence: [readAddedLineText(sqlInjectionChangedFile, 1)],
      sourceToSink: sqlInjectionModelFinding.sourceToSink,
      promptVersion: '1',
      model: defaultReviewModelId,
    })
    expect(finding?.id).toMatch(findingIdPattern)
    expect(finding?.id).toBe(
      createFindingId({
        detector: 'code-review',
        stableKey: 'src/users/find-user.ts\n15\n15\nCWE-89',
      }),
    )
  })

  test('stamps the review model on the finding and on the request, not the client model', async () => {
    const { codeReviewResult, provider } = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
      clientModelId: defaultClientModelId,
      reviewModelId: defaultReviewModelId,
    })

    expect(codeReviewResult.findings).toHaveLength(1)
    expect(codeReviewResult.findings[0]?.model).toBe(defaultReviewModelId)
    expect(provider.requests[0]?.modelId).toBe(defaultReviewModelId)
    expect(provider.requests[0]?.modelId).not.toBe(defaultClientModelId)
  })

  test('gives the same id on two runs over the same input and answers', async () => {
    // review the same file with the same answer twice
    const firstReviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })
    const secondReviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })

    // both runs give one finding with the same id
    expect(firstReviewRun.codeReviewResult.findings).toHaveLength(1)
    expect(secondReviewRun.codeReviewResult.findings).toEqual(
      firstReviewRun.codeReviewResult.findings,
    )
    expect(secondReviewRun.codeReviewResult.findings[0]?.id).toBe(
      firstReviewRun.codeReviewResult.findings[0]?.id,
    )
  })

  test('gives a different id when only the vulnerabilityType differs', async () => {
    const inputValidationFinding = {
      ...sqlInjectionModelFinding,
      vulnerabilityType: 'CWE-20',
    }

    // review the same file once with each vulnerabilityType
    const sqlInjectionReviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })
    const inputValidationReviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [buildOutputReply({ findings: [inputValidationFinding] })],
    })

    expect(inputValidationReviewRun.codeReviewResult.findings[0]?.id).toMatch(
      findingIdPattern,
    )
    expect(inputValidationReviewRun.codeReviewResult.findings[0]?.id).not.toBe(
      sqlInjectionReviewRun.codeReviewResult.findings[0]?.id,
    )
  })
})

describe('reviewCode audit trail', () => {
  test('writes one packet note with the hash, chunk count and skipped files, and one finding event per returned finding', async () => {
    // a reviewed file and a skipped lockfile, with the packet the review notes
    const changedFiles = [sqlInjectionChangedFile, lockfileChangedFile]
    const packet = assemblePacket({ changedFiles })

    const { codeReviewResult, auditSink } = await runReview({
      changedFiles,
      replies: [buildOutputReply({ findings: [sqlInjectionModelFinding] })],
    })

    // the packet note
    expect(findNotePayloads(auditSink, 'review packet assembled')).toEqual([
      {
        message: 'review packet assembled',
        packetHash: packet.hash,
        chunkCount: 1,
        skippedFiles: [{ file: 'bun.lock', reason: 'lockfile' }],
      },
    ])

    // one finding event holding each returned finding
    const findingEvents = findFindingEvents(auditSink)
    expect(findingEvents).toHaveLength(1)
    expect(findingEvents.map((event) => event.payload.finding)).toEqual(
      codeReviewResult.findings,
    )

    // every code review event is under the run and parses through the contract
    const codeReviewEvents = findCodeReviewEvents(auditSink)
    expect(codeReviewEvents.map((event) => event.kind)).toEqual([
      'note',
      'finding',
    ])
    for (const codeReviewEvent of codeReviewEvents) {
      expect(auditEventSchema.parse(codeReviewEvent).runId).toBe(reviewRunId)
    }
  })
})
