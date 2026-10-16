// reviews one packet chunk: builds the prompt, asks the model, notes the injection attempts it reports and keeps only the findings grounded in the file's added lines
import { LlmOutputValidationError } from '@/llm/llm-errors'
import type { LlmClient, PromptTemplate } from '@/shared/llm'
import type { AddedLine } from '@/shared/pull-request-source'
import {
  type CodeReviewAuditContext,
  writeCodeReviewNote,
} from './code-review-audit'
import { type GroundingRejectionReason, groundFinding } from './grounding'
import {
  type CodeReviewOutput,
  codeReviewOutputSchema,
  type InjectionAttempt,
  type ModelFinding,
} from './model-output'
import type { PacketChunk } from './review-packet'
import { buildReviewPrompt } from './review-prompt'

// what every step of one review shares: the rubric, the client, the model and where the audit goes
export interface ReviewSession {
  template: PromptTemplate
  llmClient: LlmClient
  modelId: string
  auditContext: CodeReviewAuditContext
}

// the chunk to review, the lines its file added and the session the review runs in
export interface ReviewChunkOptions {
  reviewSession: ReviewSession
  chunk: PacketChunk
  addedLines: AddedLine[]
}

// what one chunk produced: its grounded findings and counts, or nothing when its answer failed the schema
export type ChunkReview =
  | {
      kind: 'reviewed'
      groundedFindings: ModelFinding[]
      groundingRejectionCount: number
      injectionAttemptCount: number
    }
  | { kind: 'failed' }

/**
 * Asks the model about one chunk, notes the injection attempts it saw and returns its grounded findings with the counts.
 */
export async function reviewChunk({
  reviewSession,
  chunk,
  addedLines,
}: ReviewChunkOptions): Promise<ChunkReview> {
  // ask the model, giving up on the chunk when its answer fails the schema
  const codeReviewOutput = await generateChunkOutput(reviewSession, chunk)
  if (codeReviewOutput === null) {
    return { kind: 'failed' }
  }

  // note every injection attempt the model saw
  await noteInjectionAttempts(
    reviewSession.auditContext,
    codeReviewOutput.injectionAttempts,
  )

  // keep the findings grounded in the file's added lines and note each drop
  const { groundedFindings, groundingRejectionCount } =
    await groundChunkFindings({
      auditContext: reviewSession.auditContext,
      chunk,
      addedLines,
      findings: codeReviewOutput.findings,
    })

  return {
    kind: 'reviewed',
    groundedFindings,
    groundingRejectionCount,
    injectionAttemptCount: codeReviewOutput.injectionAttempts.length,
  }
}

// build the prompt and call the model. an answer that fails the schema on the attempt and the retry is noted and gives null
async function generateChunkOutput(
  reviewSession: ReviewSession,
  chunk: PacketChunk,
): Promise<CodeReviewOutput | null> {
  // fence the chunk text and render the rubric around it
  const reviewPrompt = buildReviewPrompt({
    template: reviewSession.template,
    chunkText: chunk.text,
  })

  // call the model, letting every error but a validation failure propagate
  try {
    const generateResult = await reviewSession.llmClient.generate({
      promptId: reviewSession.template.id,
      promptVersion: reviewSession.template.version,
      promptHash: reviewSession.template.hash,
      system: reviewPrompt.system,
      user: reviewPrompt.user,
      schema: codeReviewOutputSchema,
      modelId: reviewSession.modelId,
    })
    return generateResult.output
  } catch (error) {
    if (!(error instanceof LlmOutputValidationError)) {
      throw error
    }
    await noteFailedChunk({
      auditContext: reviewSession.auditContext,
      chunk,
      error,
    })
    return null
  }
}

// the chunk whose answer failed the schema and the failure to note
interface NoteFailedChunkOptions {
  auditContext: CodeReviewAuditContext
  chunk: PacketChunk
  error: LlmOutputValidationError
}

// note a chunk skipped after its answer failed the schema on the attempt and the retry
async function noteFailedChunk({
  auditContext,
  chunk,
  error,
}: NoteFailedChunkOptions): Promise<void> {
  await writeCodeReviewNote({
    ...auditContext,
    payload: {
      message: 'chunk skipped after output validation failure',
      file: chunk.file,
      chunkNumber: chunk.chunkNumber,
      error: error.message,
    },
  })
}

// write one note per injection attempt, naming its file and line
async function noteInjectionAttempts(
  auditContext: CodeReviewAuditContext,
  injectionAttempts: InjectionAttempt[],
): Promise<void> {
  for (const injectionAttempt of injectionAttempts) {
    await writeCodeReviewNote({
      ...auditContext,
      payload: {
        message: 'injection attempt',
        file: injectionAttempt.file,
        line: injectionAttempt.line,
      },
    })
  }
}

// the findings one answer reported, the chunk they answer and the lines its file added
interface GroundChunkFindingsOptions {
  auditContext: CodeReviewAuditContext
  chunk: PacketChunk
  addedLines: AddedLine[]
  findings: ModelFinding[]
}

// the findings that passed grounding and how many were dropped
interface GroundedChunkFindings {
  groundedFindings: ModelFinding[]
  groundingRejectionCount: number
}

// keep the findings grounded in the chunk's file and its added lines, noting the reason for each drop
async function groundChunkFindings({
  auditContext,
  chunk,
  addedLines,
  findings,
}: GroundChunkFindingsOptions): Promise<GroundedChunkFindings> {
  // the findings kept so far and how many were dropped
  const groundedFindings: ModelFinding[] = []
  let groundingRejectionCount = 0

  // check each finding and note the reason when it is dropped
  for (const finding of findings) {
    const groundingVerdict = groundFinding({
      finding,
      file: chunk.file,
      addedLines,
    })
    if (groundingVerdict.kind === 'grounded') {
      groundedFindings.push(finding)
      continue
    }
    groundingRejectionCount += 1
    await noteGroundingRejection({
      auditContext,
      chunk,
      finding,
      reason: groundingVerdict.reason,
    })
  }

  return { groundedFindings, groundingRejectionCount }
}

// the dropped finding, why it was dropped and the chunk it answered
interface NoteGroundingRejectionOptions {
  auditContext: CodeReviewAuditContext
  chunk: PacketChunk
  finding: ModelFinding
  reason: GroundingRejectionReason
}

// note a finding dropped by grounding, with its reason, where it pointed and the chunk it answered
async function noteGroundingRejection({
  auditContext,
  chunk,
  finding,
  reason,
}: NoteGroundingRejectionOptions): Promise<void> {
  await writeCodeReviewNote({
    ...auditContext,
    payload: {
      message: 'finding rejected by grounding',
      reason,
      file: finding.file,
      vulnerabilityType: finding.vulnerabilityType,
      title: finding.title,
      startLine: finding.startLine,
      endLine: finding.endLine,
      chunkFile: chunk.file,
      chunkNumber: chunk.chunkNumber,
    },
  })
}
