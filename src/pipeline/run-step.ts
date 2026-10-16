// runs one review step under its run-state stage. it audits the start and end with hashes and records failures
import { advanceRunState } from '@/run-state/run-state'
import { type ActiveRunStage, activeRunStages } from '@/shared/run-state'
import { addDegradedStep, type RunRecord } from './run-record'
import { hashValue } from './stable-hash'

// the steps of a review in the order they run
export const reviewSteps = [
  'describe-pull-request',
  'collect-files',
  'parse-lockfiles',
  'load-advisories',
  'match-dependencies',
  'reachability',
  'secrets',
  'code-review',
  'dedupe-findings',
  'summarize',
  'assemble-result',
] as const
export type ReviewStep = (typeof reviewSteps)[number]

// the run-state stage each step runs under. the contract has fewer stages than the pipeline has steps
export const stagesByStep: Record<ReviewStep, ActiveRunStage> = {
  'describe-pull-request': 'resolving-pull-request',
  'collect-files': 'collecting-files',
  'parse-lockfiles': 'parsing-lockfiles',
  'load-advisories': 'matching',
  'match-dependencies': 'matching',
  reachability: 'reachability',
  secrets: 'secrets',
  'code-review': 'code-review',
  'dedupe-findings': 'summarizing',
  summarize: 'summarizing',
  'assemble-result': 'rendering',
}

// the error a fatal step throws so the run stops
export class ReviewAbortedError extends Error {
  override readonly name = 'ReviewAbortedError'
  readonly step: ReviewStep

  constructor({ step, message }: ReviewAbortedErrorOptions) {
    super(message)
    this.step = step
  }
}

// the step that aborted the run and its error message
export interface ReviewAbortedErrorOptions {
  step: ReviewStep
  message: string
}

// what every step run needs. that is the record and the step and its input and the work itself
interface RunStepBaseOptions<TInput, TOutput> {
  runRecord: RunRecord
  step: ReviewStep
  input: TInput
  run: (input: TInput) => Promise<TOutput>
}

// a fatal step aborts the run on a failure. any other step returns its fallback and the run continues
export type RunStepOptions<TInput, TOutput> = RunStepBaseOptions<
  TInput,
  TOutput
> &
  ({ isFatal: true } | { isFatal: false; fallback: TOutput })

/**
 * Runs one step under its stage with step-start and step-end or step-error events, and returns its output or fallback.
 */
export async function runStep<TInput, TOutput>(
  options: RunStepOptions<TInput, TOutput>,
): Promise<TOutput> {
  const { runRecord, step, input, run } = options

  // move to the step's stage and announce the step with its input hash
  const stage = stagesByStep[step]
  advanceToStage({ runRecord, stage })
  await writeStepEvent({
    runRecord,
    step,
    kind: 'step-start',
    payload: { stage, inputHash: hashValue(input) },
  })
  const stepStartedAt = runRecord.now().getTime()

  // run the step and record its duration and output hash
  try {
    const output = await run(input)
    const durationMs = recordStepDuration({ runRecord, step, stepStartedAt })
    await writeStepEvent({
      runRecord,
      step,
      kind: 'step-end',
      payload: { stage, outputHash: hashValue(output) },
      durationMs,
    })
    return output
  } catch (error) {
    return failStep({ options, error, stepStartedAt })
  }
}

// the record and the stage to move it to
interface AdvanceToStageOptions {
  runRecord: RunRecord
  stage: ActiveRunStage
}

/**
 * Moves the run state forward one stage at a time until it reaches the given stage.
 */
export function advanceToStage({
  runRecord,
  stage,
}: AdvanceToStageOptions): void {
  // find how far the target is from the current stage
  const targetIndex = activeRunStages.indexOf(stage)
  let currentIndex = activeRunStages.indexOf(
    runRecord.runState.stage as ActiveRunStage,
  )
  if (currentIndex === -1 || targetIndex < currentIndex) {
    throw new Error(
      `cannot move the run from ${runRecord.runState.stage} to ${stage}`,
    )
  }

  // step through every stage in between
  while (currentIndex < targetIndex) {
    currentIndex += 1
    runRecord.runState = advanceRunState({
      state: runRecord.runState,
      to: activeRunStages[currentIndex] as ActiveRunStage,
      now: runRecord.now(),
    })
  }
}

// one failed step with the error it threw and when it started
interface FailStepOptions<TInput, TOutput> {
  options: RunStepOptions<TInput, TOutput>
  error: unknown
  stepStartedAt: number
}

// audit the failure. then abort the run for a fatal step or record a degraded step and return the fallback
async function failStep<TInput, TOutput>({
  options,
  error,
  stepStartedAt,
}: FailStepOptions<TInput, TOutput>): Promise<TOutput> {
  const { runRecord, step } = options

  // record the duration and write the error event
  const message = error instanceof Error ? error.message : String(error)
  const durationMs = recordStepDuration({ runRecord, step, stepStartedAt })
  await writeStepEvent({
    runRecord,
    step,
    kind: 'step-error',
    payload: { stage: stagesByStep[step], message, isFatal: options.isFatal },
    durationMs,
  })

  // stop the run on a fatal step
  if (options.isFatal) {
    throw new ReviewAbortedError({ step, message })
  }

  // keep going without this step's output
  runRecord.errors.push({ step, message, isFatal: false })
  addDegradedStep({ runRecord, step, reason: `failed: ${message}` })
  return options.fallback
}

// the record and the step and when it started
interface RecordStepDurationOptions {
  runRecord: RunRecord
  step: ReviewStep
  stepStartedAt: number
}

// store the milliseconds since the step started under the step name and return them
function recordStepDuration({
  runRecord,
  step,
  stepStartedAt,
}: RecordStepDurationOptions): number {
  const durationMs = Math.max(0, runRecord.now().getTime() - stepStartedAt)
  runRecord.stepDurations[step] = durationMs
  return durationMs
}

// one step event to write
interface WriteStepEventOptions {
  runRecord: RunRecord
  step: ReviewStep
  kind: 'step-start' | 'step-end' | 'step-error'
  payload: Record<string, unknown>
  durationMs?: number
}

// write a step event stamped with the run id and the current time
async function writeStepEvent({
  runRecord,
  step,
  kind,
  payload,
  durationMs,
}: WriteStepEventOptions): Promise<void> {
  await runRecord.auditSink.write({
    timestamp: runRecord.now().toISOString(),
    runId: runRecord.runId,
    step,
    kind,
    payload,
    ...(durationMs === undefined ? {} : { durationMs }),
  })
}
