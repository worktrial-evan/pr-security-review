// the run-state contract: the ordered review stages and the run state at each of them, with the error only on a failed run
import { z } from 'zod'

// the stages a run moves through, in order. done ends a run that finished
export const activeRunStages = [
  'resolving-pull-request',
  'collecting-files',
  'parsing-lockfiles',
  'matching',
  'reachability',
  'secrets',
  'code-review',
  'summarizing',
  'rendering',
  'done',
] as const
export const activeRunStageSchema = z.enum(activeRunStages)
export type ActiveRunStage = z.infer<typeof activeRunStageSchema>

// every stage, with failed as the one a run can reach from anywhere
export const runStages = [...activeRunStages, 'failed'] as const
export const runStageSchema = z.enum(runStages)
export type RunStage = z.infer<typeof runStageSchema>

// a stage the run has left, with how long it took
export const completedStageSchema = z.object({
  stage: runStageSchema,
  durationMs: z.number().nonnegative(),
})
export type CompletedStage = z.infer<typeof completedStageSchema>

// why a run failed. step names the step that threw when one is known
export const runErrorSchema = z.object({
  message: z.string(),
  step: z.string().optional(),
  stack: z.string().optional(),
})
export type RunError = z.infer<typeof runErrorSchema>

// the fields every run state has. the object is strict and every state built on it stays strict
const runStateBaseSchema = z.strictObject({
  runId: z.string(),
  startedAt: z.iso.datetime({ offset: true }),
  completedStages: z.array(completedStageSchema),
})

// a run at any stage but failed. the object is strict so an error cannot ride on an active run
export const activeRunStateSchema = runStateBaseSchema.extend({
  stage: activeRunStageSchema,
})
export type ActiveRunState = z.infer<typeof activeRunStateSchema>

// a failed run, which is the only state that holds an error
export const failedRunStateSchema = runStateBaseSchema.extend({
  stage: z.literal('failed'),
  error: runErrorSchema,
})
export type FailedRunState = z.infer<typeof failedRunStateSchema>

// the state of a run, selected by its stage
export const runStateSchema = z.discriminatedUnion('stage', [
  activeRunStateSchema,
  failedRunStateSchema,
])
export type RunState = z.infer<typeof runStateSchema>
