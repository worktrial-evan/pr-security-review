// tests for the run-state module: a run starts at resolving-pull-request, moves one stage forward or to failed with an error, records exact durations under an injected clock, rejects every other move with a typed error and never mutates its input
import { describe, expect, test } from 'bun:test'
import {
  type ActiveRunStage,
  type ActiveRunState,
  activeRunStages,
  type FailedRunState,
  type RunError,
  type RunState,
  runStages,
  runStateSchema,
} from '@/shared/run-state'
import {
  type AdvanceRunStateOptions,
  advanceRunState,
  createRunState,
  IllegalTransitionError,
} from './run-state'

// the id and start time every sample run shares
const sampleRunId = 'abc'
const runStartedAt = new Date('2026-10-15T08:30:00.000Z')

// the time every completed stage took in the sample states
const sampleStageDurationMs = 100

// the error a sample run fails with
const sampleRunError: RunError = {
  message: 'advisory snapshot is unreadable',
  step: 'matching',
}

describe('createRunState', () => {
  test('starts at resolving-pull-request with the run id and no completed stages', () => {
    // create a run under the injected clock and compare the whole state
    const runState = createRunState({ runId: sampleRunId, now: runStartedAt })
    expect(runState).toEqual({
      stage: 'resolving-pull-request',
      runId: sampleRunId,
      startedAt: '2026-10-15T08:30:00.000Z',
      completedStages: [],
    })
  })

  test('defaults the clock to the current time', () => {
    // read the clock before and after the call
    const beforeCreateMs = Date.now()
    const runState = createRunState({ runId: sampleRunId })
    const afterCreateMs = Date.now()

    // check the start time lies in that window
    const startedAtMs = Date.parse(runState.startedAt)
    expect(startedAtMs).toBeGreaterThanOrEqual(beforeCreateMs)
    expect(startedAtMs).toBeLessThanOrEqual(afterCreateMs)
  })

  test('produces a state that parses against the contract', () => {
    // create a run and parse it against the contract
    const runState = createRunState({ runId: sampleRunId, now: runStartedAt })
    expect(runStateSchema.parse(runState)).toEqual(runState)
  })
})

describe('advanceRunState', () => {
  test('moves to the next stage and records the duration of the stage it leaves', () => {
    // advance a run that has spent 1234 milliseconds in matching
    const matchingRunState = buildRunStateAt('matching')
    const now = clockAt(sampleStageStartMs('matching') + 1234)
    const reachabilityRunState = advanceRunState({
      state: matchingRunState,
      to: 'reachability',
      now,
    })

    // check the new state is at reachability with matching closed at 1234 milliseconds
    expect(reachabilityRunState).toEqual({
      ...matchingRunState,
      stage: 'reachability',
      completedStages: [
        ...matchingRunState.completedStages,
        { stage: 'matching', durationMs: 1234 },
      ],
    })
    expect(runStateSchema.parse(reachabilityRunState)).toEqual(
      reachabilityRunState,
    )
  })

  test('leaves the input state unchanged after a legal advance', () => {
    // keep a copy of the input and advance it
    const matchingRunState = buildRunStateAt('matching')
    const stateBeforeAdvance = structuredClone(matchingRunState)
    const reachabilityRunState = advanceRunState({
      state: matchingRunState,
      to: 'reachability',
      now: clockAt(sampleStageStartMs('matching') + 50),
    })

    // check the input is untouched and the new state owns its own list
    expect(matchingRunState).toEqual(stateBeforeAdvance)
    expect(reachabilityRunState.completedStages).not.toBe(
      matchingRunState.completedStages,
    )
  })

  test('walks every stage from resolving-pull-request to done', () => {
    // advance through every stage with 100 milliseconds between moves
    let runState: RunState = createRunState({
      runId: sampleRunId,
      now: runStartedAt,
    })
    let elapsedMs = 0
    for (const nextStage of activeRunStages.slice(1)) {
      elapsedMs += sampleStageDurationMs
      runState = advanceRunState({
        state: runState,
        to: nextStage,
        now: clockAt(elapsedMs),
      })
    }

    // check the run is done with every earlier stage completed in order
    expect(runState).toEqual(buildRunStateAt('done'))
  })

  test('rejects skipping a stage', () => {
    expectIllegalTransition({
      state: buildRunStateAt('matching'),
      to: 'secrets',
    })
  })

  test('rejects moving backwards', () => {
    expectIllegalTransition({
      state: buildRunStateAt('secrets'),
      to: 'matching',
    })
  })

  test('rejects staying at the same stage', () => {
    expectIllegalTransition({
      state: buildRunStateAt('matching'),
      to: 'matching',
    })
  })

  test('rejects every move out of done', () => {
    for (const to of runStages) {
      expectIllegalTransition({
        state: buildRunStateAt('done'),
        to,
        error: sampleRunError,
      })
    }
  })

  test('rejects every move out of failed', () => {
    for (const to of runStages) {
      expectIllegalTransition({
        state: buildFailedRunState(),
        to,
        error: sampleRunError,
      })
    }
  })

  test('fails early from collecting-files with the error', () => {
    // fail a run that has spent 40 milliseconds collecting files
    const collectingFilesRunState = buildRunStateAt('collecting-files')
    const failedRunState = advanceRunState({
      state: collectingFilesRunState,
      to: 'failed',
      error: sampleRunError,
      now: clockAt(sampleStageStartMs('collecting-files') + 40),
    })

    // check the new state is failed, holds the error and closed collecting-files at 40 milliseconds
    expect(failedRunState).toEqual({
      ...collectingFilesRunState,
      stage: 'failed',
      completedStages: [
        ...collectingFilesRunState.completedStages,
        { stage: 'collecting-files', durationMs: 40 },
      ],
      error: sampleRunError,
    })
    expect(runStateSchema.parse(failedRunState)).toEqual(failedRunState)
  })

  test('fails from every stage before done', () => {
    for (const stage of activeRunStages) {
      // skip done, which no move can leave
      if (stage === 'done') {
        continue
      }

      // fail a run at this stage and check the error is kept
      const failedRunState = advanceRunState({
        state: buildRunStateAt(stage),
        to: 'failed',
        error: sampleRunError,
        now: clockAt(sampleStageStartMs(stage) + 10),
      })
      expect(failedRunState.stage).toBe('failed')
      expect(failedRunState).toMatchObject({ error: sampleRunError })
      expect(failedRunState.completedStages.at(-1)).toEqual({
        stage,
        durationMs: 10,
      })
    }
  })

  test('rejects failing without an error', () => {
    expectIllegalTransition({
      state: buildRunStateAt('matching'),
      to: 'failed',
    })
  })

  test('throws an error callers can catch by type', () => {
    // attempt a skip inside a try block
    try {
      advanceRunState({ state: buildRunStateAt('matching'), to: 'secrets' })
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalTransitionError)
      expect(error).toBeInstanceOf(Error)
      expect(error).toMatchObject({
        name: 'IllegalTransitionError',
        from: 'matching',
        to: 'secrets',
      })
      return
    }
    throw new Error('the skip was not rejected')
  })
})

// build an active run state at the given stage, with every earlier stage completed in 100 milliseconds
function buildRunStateAt(stage: ActiveRunStage): ActiveRunState {
  // complete every stage before the given one
  const stageIndex = activeRunStages.indexOf(stage)
  const earlierStages = activeRunStages.slice(0, stageIndex)
  const completedStages = earlierStages.map((earlierStage) => ({
    stage: earlierStage,
    durationMs: sampleStageDurationMs,
  }))

  return {
    stage,
    runId: sampleRunId,
    startedAt: runStartedAt.toISOString(),
    completedStages,
  }
}

// build a clock set the given number of milliseconds after the run started
function clockAt(elapsedMs: number): Date {
  return new Date(runStartedAt.getTime() + elapsedMs)
}

// the milliseconds after the run start at which the given stage of a sample state began
function sampleStageStartMs(stage: ActiveRunStage): number {
  return activeRunStages.indexOf(stage) * sampleStageDurationMs
}

// assert that the advance throws an IllegalTransitionError naming its stages and leaves the input state unchanged
function expectIllegalTransition(options: AdvanceRunStateOptions): void {
  // keep a copy of the input to compare after the rejection
  const stateBeforeAdvance = structuredClone(options.state)

  // catch the error and narrow it for the field checks
  const caughtError = catchAdvanceError(options)
  expect(caughtError).toBeInstanceOf(IllegalTransitionError)
  if (!(caughtError instanceof IllegalTransitionError)) {
    return
  }

  // check the stages on the error and in its message
  expect(caughtError.from).toBe(options.state.stage)
  expect(caughtError.to).toBe(options.to)
  expect(caughtError.message).toContain(`'${options.state.stage}'`)
  expect(caughtError.message).toContain(`'${options.to}'`)

  // check the input state is untouched
  expect(options.state).toEqual(stateBeforeAdvance)
}

// run the advance and return what it throws, or null when it does not throw
function catchAdvanceError(options: AdvanceRunStateOptions): unknown {
  try {
    advanceRunState(options)
  } catch (error) {
    return error
  }
  return null
}

// build a run that failed during matching
function buildFailedRunState(): FailedRunState {
  return {
    ...buildRunStateAt('matching'),
    stage: 'failed',
    error: sampleRunError,
  }
}
