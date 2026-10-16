// the harness the review tests share: runs reviewCode on the fake provider with the memory audit sink, builds canned replies, assembles the packet under test and reads the audit trail back
import {
  createFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmReply,
} from '@/llm/fake-llm-provider'
import { createLlmClient } from '@/llm/llm-client'
import type { ModelPrice } from '@/llm/model-config'
import type { AuditEvent } from '@/shared/audit'
import type { ChangedFile } from '@/shared/pull-request-source'
import { codeReviewStep } from '../code-review-audit'
import type {
  CodeReviewOutput,
  InjectionAttempt,
  ModelFinding,
} from '../model-output'
import { type CodeReviewResult, reviewCode } from '../review-code'
import { assembleReviewPacket, type ReviewPacket } from '../review-packet'
import { codeReviewPromptId } from '../review-prompt'
import { testContextLines } from './changed-files'
import {
  createMemoryAuditSink,
  type MemoryAuditSink,
} from './memory-audit-sink'

// the run every review writes its audit events under
export const reviewRunId = 'run-review-code-test'

// the model the client is configured with and the model the review asks for, both priced at zero
export const defaultClientModelId = 'anthropic/fake-client'
export const defaultReviewModelId = 'anthropic/fake-reviewer'
const zeroModelPrice: ModelPrice = {
  inputUsdPerMillionTokens: 0,
  outputUsdPerMillionTokens: 0,
}

// the files one review runs over, how the fake model answers each chunk in order, and the review settings
export interface RunReviewOptions {
  changedFiles: ChangedFile[]
  replies: FakeLlmReply[]
  isLlmEnabled?: boolean
  contextLines?: number
  maxChunkLines?: number
  clientModelId?: string
  reviewModelId?: string
  promptVersion?: number
  promptsDirectory?: string
}

// the review result with the provider that answered it and the audit sink it wrote to
export interface ReviewRun {
  codeReviewResult: CodeReviewResult
  provider: FakeLlmProvider
  auditSink: MemoryAuditSink
}

// the findings and injection attempts one canned answer reports
export interface BuildOutputReplyOptions {
  findings?: ModelFinding[]
  injectionAttempts?: InjectionAttempt[]
}

// the files to pack and the chunk limit, at the context lines every test renders at
export interface AssemblePacketOptions {
  changedFiles: ChangedFile[]
  maxChunkLines?: number
}

/**
 * Reviews the changed files through a client on the fake provider with the canned replies, and returns the result with its provider and audit sink.
 */
export async function runReview({
  changedFiles,
  replies,
  isLlmEnabled = true,
  contextLines = testContextLines,
  maxChunkLines,
  clientModelId = defaultClientModelId,
  reviewModelId = defaultReviewModelId,
  promptVersion,
  promptsDirectory,
}: RunReviewOptions): Promise<ReviewRun> {
  // wire the fake provider, the zero-priced models and the memory audit sink
  const provider = createFakeLlmProvider({ [codeReviewPromptId]: replies })
  const auditSink = createMemoryAuditSink()
  const llmClient = createLlmClient({
    modelId: clientModelId,
    prices: {
      [clientModelId]: zeroModelPrice,
      [reviewModelId]: zeroModelPrice,
    },
    auditSink,
    runId: reviewRunId,
    isCacheEnabled: false,
    provider,
  })

  // review the files on the review model
  const codeReviewResult = await reviewCode({
    changedFiles,
    llmClient,
    auditSink,
    runId: reviewRunId,
    isLlmEnabled,
    contextLines,
    modelId: reviewModelId,
    promptVersion,
    promptsDirectory,
    maxChunkLines,
  })

  return { codeReviewResult, provider, auditSink }
}

/**
 * Builds a fake provider reply holding a valid answer with the given findings and injection attempts.
 */
export function buildOutputReply({
  findings = [],
  injectionAttempts = [],
}: BuildOutputReplyOptions): FakeLlmReply {
  const codeReviewOutput: CodeReviewOutput = { findings, injectionAttempts }
  return { kind: 'output', output: codeReviewOutput }
}

// an answer with nothing to report, as a reply
export const emptyOutputReply = buildOutputReply({})

/**
 * Assembles the packet a review under test sends, at the context lines every test renders at.
 */
export function assemblePacket({
  changedFiles,
  maxChunkLines,
}: AssemblePacketOptions): ReviewPacket {
  return assembleReviewPacket({
    changedFiles,
    contextLines: testContextLines,
    maxChunkLines,
  })
}

/**
 * Returns the text of one added line of a changed file, by its position in addedLines.
 */
export function readAddedLineText(
  changedFile: ChangedFile,
  index: number,
): string {
  const addedLine = changedFile.addedLines[index]
  if (addedLine === undefined) {
    throw new Error(`${changedFile.path} has no added line at index ${index}`)
  }
  return addedLine.text
}

/**
 * Returns the code review events of a run, in write order.
 */
export function findCodeReviewEvents(auditSink: MemoryAuditSink): AuditEvent[] {
  return auditSink.events.filter((event) => event.step === codeReviewStep)
}

/**
 * Returns the payloads of the code review notes with a message, in write order.
 */
export function findNotePayloads(
  auditSink: MemoryAuditSink,
  message: string,
): Record<string, unknown>[] {
  const matchingNotes = findCodeReviewEvents(auditSink).filter(
    (event) => event.kind === 'note' && event.payload.message === message,
  )
  return matchingNotes.map((event) => event.payload)
}

/**
 * Returns the code review finding events of a run, in write order.
 */
export function findFindingEvents(auditSink: MemoryAuditSink): AuditEvent[] {
  return findCodeReviewEvents(auditSink).filter(
    (event) => event.kind === 'finding',
  )
}
