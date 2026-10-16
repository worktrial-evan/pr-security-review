// runs the code review: loads the rubric, packs the changed files, reviews every chunk in order, dedupes the grounded answers and returns the findings with their audit trail
import { loadPrompt } from '@/prompts/prompt-loader'
import type { AuditSink } from '@/shared/audit'
import {
  type CodeReviewFinding,
  codeReviewFindingSchema,
  createFindingId,
} from '@/shared/finding'
import type { LlmClient } from '@/shared/llm'
import type { ChangedFile } from '@/shared/pull-request-source'
import {
  type CodeReviewAuditContext,
  writeCodeReviewFinding,
  writeCodeReviewNote,
} from './code-review-audit'
import { dedupeFindings } from './dedupe-findings'
import type { ModelFinding } from './model-output'
import {
  type ChunkReview,
  type ReviewSession,
  reviewChunk,
} from './review-chunk'
import {
  assembleReviewPacket,
  type PacketChunk,
  type ReviewPacket,
} from './review-packet'
import { codeReviewPromptId } from './review-prompt'

// the detector every code review finding names
const codeReviewDetector = 'code-review'

// the changed files to review, the client and audit sink to use, and the review settings
export interface ReviewCodeOptions {
  changedFiles: ChangedFile[]
  llmClient: LlmClient
  auditSink: AuditSink
  runId: string
  isLlmEnabled: boolean
  contextLines: number
  modelId: string
  promptVersion?: number
  promptsDirectory?: string
  maxChunkLines?: number
}

// the grounded and deduped findings, with the counts of dropped findings, injection attempts and skipped chunks
export interface CodeReviewResult {
  findings: CodeReviewFinding[]
  groundingRejectionCount: number
  injectionAttemptCount: number
  failedChunkCount: number
  promptVersion: string
}

// the grounded findings of every chunk and the counts added up across chunks
interface ReviewTotals {
  groundedFindings: ModelFinding[]
  groundingRejectionCount: number
  injectionAttemptCount: number
  failedChunkCount: number
}

/**
 * Reviews the changed files with the model, one call per chunk, and returns the grounded and deduped findings.
 */
export async function reviewCode({
  changedFiles,
  llmClient,
  auditSink,
  runId,
  isLlmEnabled,
  contextLines,
  modelId,
  promptVersion,
  promptsDirectory,
  maxChunkLines,
}: ReviewCodeOptions): Promise<CodeReviewResult> {
  // load the rubric and gather what every step shares
  const reviewSession = await openReviewSession({
    llmClient,
    auditSink,
    runId,
    modelId,
    promptVersion,
    promptsDirectory,
  })

  // skip the review when the llm is disabled
  if (!isLlmEnabled) {
    return skipReview(reviewSession)
  }

  // pack the changed files and ask the model about every chunk in order
  const reviewTotals = await reviewChangedFiles({
    reviewSession,
    changedFiles,
    contextLines,
    maxChunkLines,
  })

  // collapse duplicates, shape the findings and audit each one
  return finishReview(reviewSession, reviewTotals)
}

// the client and audit sink and run and model one review runs with. also the prompt version and location
interface OpenReviewSessionOptions {
  llmClient: LlmClient
  auditSink: AuditSink
  runId: string
  modelId: string
  promptVersion?: number
  promptsDirectory?: string
}

// load the rubric and gather what every step of the review shares
async function openReviewSession({
  llmClient,
  auditSink,
  runId,
  modelId,
  promptVersion,
  promptsDirectory,
}: OpenReviewSessionOptions): Promise<ReviewSession> {
  // load the rubric at the given version. without one take the highest version
  const template = await loadPrompt({
    id: codeReviewPromptId,
    version: promptVersion,
    promptsDirectory,
  })

  return { template, llmClient, modelId, auditContext: { auditSink, runId } }
}

// note the skip and return an empty result that still names the prompt version
async function skipReview(
  reviewSession: ReviewSession,
): Promise<CodeReviewResult> {
  // note the skip
  await writeCodeReviewNote({
    ...reviewSession.auditContext,
    payload: { message: 'code review skipped because the llm is disabled' },
  })

  return {
    findings: [],
    groundingRejectionCount: 0,
    injectionAttemptCount: 0,
    failedChunkCount: 0,
    promptVersion: reviewSession.template.version,
  }
}

// the files to review, how much context each hunk keeps and how many lines a chunk holds
interface ReviewChangedFilesOptions {
  reviewSession: ReviewSession
  changedFiles: ChangedFile[]
  contextLines: number
  maxChunkLines?: number
}

// pack the changed files, note the packet and ask the model about every chunk in order
async function reviewChangedFiles({
  reviewSession,
  changedFiles,
  contextLines,
  maxChunkLines,
}: ReviewChangedFilesOptions): Promise<ReviewTotals> {
  // pack the changed files and note the packet
  const packet = assembleReviewPacket({
    changedFiles,
    contextLines,
    maxChunkLines,
  })
  await notePacket(reviewSession.auditContext, packet)

  // index the files by path
  const changedFilesByPath = new Map<string, ChangedFile>()
  for (const changedFile of changedFiles) {
    changedFilesByPath.set(changedFile.path, changedFile)
  }

  // review every chunk in order
  const chunkReviews: ChunkReview[] = []
  for (const chunk of packet.chunks) {
    const changedFile = findChunkChangedFile(changedFilesByPath, chunk)
    const chunkReview = await reviewChunk({
      reviewSession,
      chunk,
      addedLines: changedFile.addedLines,
    })
    chunkReviews.push(chunkReview)
  }

  return addUpChunkReviews(chunkReviews)
}

// note the packet hash, the chunk count and the files left out
async function notePacket(
  auditContext: CodeReviewAuditContext,
  packet: ReviewPacket,
): Promise<void> {
  await writeCodeReviewNote({
    ...auditContext,
    payload: {
      message: 'review packet assembled',
      packetHash: packet.hash,
      chunkCount: packet.chunks.length,
      skippedFiles: packet.skippedFiles,
    },
  })
}

// return the changed file a chunk was packed from
function findChunkChangedFile(
  changedFilesByPath: Map<string, ChangedFile>,
  chunk: PacketChunk,
): ChangedFile {
  const changedFile = changedFilesByPath.get(chunk.file)
  if (changedFile === undefined) {
    throw new Error(
      `review packet names ${chunk.file}, which is not among the changed files`,
    )
  }
  return changedFile
}

// add up the chunk reviews: every grounded finding and the counts of drops, attempts and failed chunks
function addUpChunkReviews(chunkReviews: ChunkReview[]): ReviewTotals {
  const reviewTotals: ReviewTotals = {
    groundedFindings: [],
    groundingRejectionCount: 0,
    injectionAttemptCount: 0,
    failedChunkCount: 0,
  }

  // count a failed chunk, and add what a reviewed chunk produced
  for (const chunkReview of chunkReviews) {
    if (chunkReview.kind === 'failed') {
      reviewTotals.failedChunkCount += 1
      continue
    }
    reviewTotals.groundedFindings.push(...chunkReview.groundedFindings)
    reviewTotals.groundingRejectionCount += chunkReview.groundingRejectionCount
    reviewTotals.injectionAttemptCount += chunkReview.injectionAttemptCount
  }

  return reviewTotals
}

// collapse duplicate findings, shape each deduped finding as a code review finding, audit it and build the result
async function finishReview(
  reviewSession: ReviewSession,
  reviewTotals: ReviewTotals,
): Promise<CodeReviewResult> {
  // collapse duplicates and shape the deduped findings with their provenance
  const dedupedFindings = dedupeFindings(reviewTotals.groundedFindings)
  const findings = dedupedFindings.map((modelFinding) =>
    toCodeReviewFinding({
      modelFinding,
      promptVersion: reviewSession.template.version,
      modelId: reviewSession.modelId,
    }),
  )

  // write one finding event per finding
  for (const finding of findings) {
    await writeCodeReviewFinding({ ...reviewSession.auditContext, finding })
  }

  return {
    findings,
    groundingRejectionCount: reviewTotals.groundingRejectionCount,
    injectionAttemptCount: reviewTotals.injectionAttemptCount,
    failedChunkCount: reviewTotals.failedChunkCount,
    promptVersion: reviewSession.template.version,
  }
}

// the grounded model finding to shape and the provenance it records
interface ToCodeReviewFindingOptions {
  modelFinding: ModelFinding
  promptVersion: string
  modelId: string
}

// shape a model finding as a code review finding with an id derived from where and what it is, parsed through the contract
function toCodeReviewFinding({
  modelFinding,
  promptVersion,
  modelId,
}: ToCodeReviewFindingOptions): CodeReviewFinding {
  // derive the id from the file, the range and the cwe
  const stableKey = [
    modelFinding.file,
    String(modelFinding.startLine),
    String(modelFinding.endLine),
    modelFinding.cwe,
  ].join('\n')
  const id = createFindingId({ detector: codeReviewDetector, stableKey })

  // parse the finding through the contract
  return codeReviewFindingSchema.parse({
    id,
    detector: codeReviewDetector,
    severity: modelFinding.severity,
    confidence: modelFinding.confidence,
    title: modelFinding.title,
    file: modelFinding.file,
    startLine: modelFinding.startLine,
    endLine: modelFinding.endLine,
    isIntroducedByPullRequest: true,
    remediation: modelFinding.remediation,
    cwe: modelFinding.cwe,
    evidence: modelFinding.evidence,
    sourceToSink: modelFinding.sourceToSink,
    promptVersion,
    model: modelId,
  })
}
