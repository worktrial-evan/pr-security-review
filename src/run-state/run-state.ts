// the run-state module: starts a review run at its first stage and moves it one stage forward, or to failed with an error, recording how long each stage took
import {
  type ActiveRunStage,
  type ActiveRunState,
  activeRunStages,
  type CompletedStage,
  type FailedRunState,
  type RunError,
  type RunStage,
  type RunState,
} from '@/shared/run-state'

// the stage every run starts at
const firstRunStage: ActiveRunStage = activeRunStages[0]

// the stages of a rejected move and why the stage order does not allow it
export interface IllegalTransitionErrorOptions {
  from: RunStage
  to: RunStage
  reason: string
}

// the error thrown for a move the stage order does not allow. from and to name the rejected move
export class IllegalTransitionError extends Error {
  readonly from: RunStage
  readonly to: RunStage

  constructor({ from, to, reason }: IllegalTransitionErrorOptions) {
    // name both stages in the message and keep them as fields
    super(`cannot advance a run from '${from}' to '${to}': ${reason}`)
    this.name = 'IllegalTransitionError'
    this.from = from
    this.to = to
  }
}

// the inputs of a new run state. now defaults to the current time
export interface CreateRunStateOptions {
  runId: string
  now?: Date
}

/** Creates a run state at the first stage with the given run id and no completed stages. */
export function createRunState({
  runId,
  now = new Date(),
}: CreateRunStateOptions): RunState {
  return {
    stage: firstRunStage,
    runId,
    startedAt: now.toISOString(),
    completedStages: [],
  }
}

// the inputs of a move to another stage. error is required when to is failed, and now defaults to the current time
export interface AdvanceRunStateOptions {
  state: RunState
  to: RunStage
  error?: RunError
  now?: Date
}

/** Advances a run to the next stage, or to failed with an error, and records how long the stage it leaves took. */
export function advanceRunState({
  state,
  to,
  error,
  now = new Date(),
}: AdvanceRunStateOptions): RunState {
  // reject any move out of done or failed
  if (state.stage === 'done' || state.stage === 'failed') {
    throw new IllegalTransitionError({
      from: state.stage,
      to,
      reason: 'the run has already ended',
    })
  }

  // fail from any other stage
  if (to === 'failed') {
    return failRunState({ state, error, now })
  }

  // reject any move to a stage other than the one right after the current stage
  const nextStageIndex = activeRunStages.indexOf(state.stage) + 1
  const isNextStage = activeRunStages[nextStageIndex] === to
  if (!isNextStage) {
    throw new IllegalTransitionError({
      from: state.stage,
      to,
      reason: `'${to}' is not the stage after '${state.stage}'`,
    })
  }

  // move to the next stage with the current one closed
  return {
    stage: to,
    runId: state.runId,
    startedAt: state.startedAt,
    completedStages: completeCurrentStage(state, now),
  }
}

// the inputs of a move to failed
interface FailRunStateOptions {
  state: ActiveRunState
  error?: RunError
  now: Date
}

// move a run to failed with the error that explains the failure
function failRunState({
  state,
  error,
  now,
}: FailRunStateOptions): FailedRunState {
  // reject a failure that has no error to record
  if (error === undefined) {
    throw new IllegalTransitionError({
      from: state.stage,
      to: 'failed',
      reason: 'a failed run needs an error',
    })
  }

  // close the current stage and keep the error on the failed state
  return {
    stage: 'failed',
    runId: state.runId,
    startedAt: state.startedAt,
    completedStages: completeCurrentStage(state, now),
    error,
  }
}

// close the current stage of a run with the time spent in it, on a copy of the completed stages
function completeCurrentStage(
  state: ActiveRunState,
  now: Date,
): CompletedStage[] {
  // add up the time the completed stages took
  const completedDurationMs = state.completedStages.reduce(
    (totalMs, completedStage) => totalMs + completedStage.durationMs,
    0,
  )

  // compute the time spent in the current stage. it started when the last completed stage ended
  const runStartedAtMs = Date.parse(state.startedAt)
  const stageStartedAtMs = runStartedAtMs + completedDurationMs
  const durationMs = now.getTime() - stageStartedAtMs

  // append the closed stage without touching the input list
  return [...state.completedStages, { stage: state.stage, durationMs }]
}
