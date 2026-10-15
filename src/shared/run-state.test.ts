// tests for the run-state contract: both states round-trip, a failed state requires an error and an active state rejects one
import { describe, expect, test } from 'bun:test'
import {
  type ActiveRunState,
  activeRunStages,
  type FailedRunState,
  runStages,
  runStateSchema,
} from './run-state'

// a run in the middle of matching
const activeRunStateSample: ActiveRunState = {
  stage: 'matching',
  runId: 'run-20261015-083000',
  startedAt: '2026-10-15T08:30:00.000Z',
  completedStages: [
    { stage: 'resolving-pull-request', durationMs: 410 },
    { stage: 'collecting-files', durationMs: 95 },
    { stage: 'parsing-lockfiles', durationMs: 30 },
  ],
}

// the same run after the matching step threw
const failedRunStateSample: FailedRunState = {
  stage: 'failed',
  runId: 'run-20261015-083000',
  startedAt: '2026-10-15T08:30:00.000Z',
  completedStages: activeRunStateSample.completedStages,
  error: {
    message: 'advisory snapshot is unreadable',
    step: 'matching',
    stack: 'Error: advisory snapshot is unreadable',
  },
}

describe('runStages', () => {
  test('failed comes last after every active stage', () => {
    // compare the full list against the active stages plus failed
    expect(runStages).toEqual([...activeRunStages, 'failed'])
    expect(runStages.at(-1)).toBe('failed')
  })
})

describe('runStateSchema', () => {
  test('an active state round-trips', () => {
    expect(runStateSchema.parse(activeRunStateSample)).toEqual(
      activeRunStateSample,
    )
  })

  test('a failed state round-trips', () => {
    expect(runStateSchema.parse(failedRunStateSample)).toEqual(
      failedRunStateSample,
    )
  })

  test('a failed state requires an error', () => {
    // drop the error from the failed state
    const { error: _error, ...failedRunStateWithoutError } =
      failedRunStateSample
    expect(() => runStateSchema.parse(failedRunStateWithoutError)).toThrow(
      /error/,
    )
  })

  test('an active state with an error field is rejected', () => {
    // put the failed state's error on the active state
    const activeRunStateWithError = {
      ...activeRunStateSample,
      error: failedRunStateSample.error,
    }
    expect(() => runStateSchema.parse(activeRunStateWithError)).toThrow(/error/)
  })
})
