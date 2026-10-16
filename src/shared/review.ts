// the review contract: the options a review runs with, the metadata and result it produces, and the ReviewPipeline type
import { z } from 'zod'
import { advisorySnapshotSchema } from './advisory'
import type { AuditSink } from './audit'
import { findingSchema, severitySchema } from './finding'
import {
  type PullRequestSource,
  pullRequestReferenceSchema,
} from './pull-request-source'

// how a review runs. failOnSeverity is the lowest severity that fails the review
export const reviewOptionsSchema = z.object({
  isLlmEnabled: z.boolean(),
  isCacheEnabled: z.boolean(),
  isOffline: z.boolean(),
  advisoryCacheDir: z.string(),
  reviewModelId: z.string(),
  summarizeModelId: z.string(),
  contextLines: z.number().int().nonnegative(),
  failOnSeverity: severitySchema.optional(),
})
export type ReviewOptions = z.infer<typeof reviewOptionsSchema>

// what a review ran against and what it cost. the records are keyed by step name
// suspectedPromptInjectionCount counts the injection attempts the model reported in the reviewed content
export const reviewMetadataSchema = z.object({
  runId: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  pullRequestReference: pullRequestReferenceSchema.optional(),
  baseSha: z.string(),
  headSha: z.string(),
  stepDurations: z.record(z.string(), z.number().nonnegative()),
  totalCostUsd: z.number().nonnegative(),
  advisorySnapshot: advisorySnapshotSchema.optional(),
  promptVersions: z.record(z.string(), z.string()),
  modelIds: z.record(z.string(), z.string()),
  groundingRejectionCount: z.number().int().nonnegative(),
  suspectedPromptInjectionCount: z.number().int().nonnegative(),
  degradedSteps: z.array(z.string()),
})
export type ReviewMetadata = z.infer<typeof reviewMetadataSchema>

// a step that failed. isFatal says the review stopped there
export const stepErrorSchema = z.object({
  step: z.string(),
  message: z.string(),
  isFatal: z.boolean(),
})
export type StepError = z.infer<typeof stepErrorSchema>

// everything a review produces
export const reviewResultSchema = z.object({
  metadata: reviewMetadataSchema,
  findings: z.array(findingSchema),
  errors: z.array(stepErrorSchema),
})
export type ReviewResult = z.infer<typeof reviewResultSchema>

// what a pipeline needs to review one pull request
export interface ReviewPipelineOptions {
  pullRequestSource: PullRequestSource
  reviewOptions: ReviewOptions
  auditSink: AuditSink
}

// a function that reviews one pull request end to end
export type ReviewPipeline = (
  options: ReviewPipelineOptions,
) => Promise<ReviewResult>
