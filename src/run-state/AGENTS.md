# run-state module

## Purpose

Tracks where a review run is in its ordered stages and allows only forward moves, so a run can never skip a stage or finish without completing them all.

## Public API

- `IllegalTransitionErrorOptions`: `from`, `to`, `reason`
- `IllegalTransitionError`: the error class thrown for a move the stage order does not allow. It extends `Error`, its `name` is `IllegalTransitionError`, it keeps the rejected move in its readonly `from` and `to` fields, and its message names both stages and the reason
- `CreateRunStateOptions`: `runId`, optional `now`
- `createRunState({ runId, now })`: returns a `RunState` at `resolving-pull-request` with the given run id, `startedAt` set to `now.toISOString()` and no completed stages. `now` defaults to the current time
- `AdvanceRunStateOptions`: `state`, `to`, optional `error`, optional `now`
- `advanceRunState({ state, to, error, now })`: returns a new `RunState` at `to`, with the stage being left appended to `completedStages` together with the milliseconds it took. `to` is either the stage right after `state.stage` or `failed`, and `failed` needs an `error`, which the failed state keeps. Any other move throws `IllegalTransitionError`. `now` defaults to the current time

## Inputs and outputs

The module reads a `RunState`, a target `RunStage`, an optional `RunError` and a `Date` clock, and produces a new `RunState`. The stage order comes from `activeRunStages` in `src/shared/run-state.ts`. Nothing is persisted: a caller keeps the returned state and passes it to the next advance.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `run-state.ts`: `IllegalTransitionError`, `createRunState`, `advanceRunState` and the helpers that fail a run and close its current stage
- `run-state.test.ts`: create, a legal advance with an exact duration, a walk through every stage to done, skip, backwards and same-stage rejected, every move out of done and failed rejected, failed from every earlier stage with the error, failed without an error rejected, the input unchanged after any advance, every returned state parsing against `runStateSchema`, and the error catchable by type with `from` and `to`
- `tsconfig.json`: the module's composite TypeScript project. It references `shared`, this module's row of the matrix
- `AGENTS.md`: this file

## Invariants

- Forward only. A legal move goes to the stage right after the current one in `activeRunStages`, never to an earlier stage, the same stage or one further ahead.
- `failed` is reachable from every stage except `done` and `failed`, and only with an error. The failed state keeps that error.
- `done` and `failed` are terminal. No move leaves them, not even to `failed` with an error.
- The input state is never mutated. Every advance returns a new state with a copied `completedStages` list, and a rejected advance leaves the input exactly as it was.
- The start of the current stage is derived, never stored: it is `startedAt` plus the sum of the completed durations. The duration recorded for the stage being left is `now` minus that start, so with an injected clock durations are exact.
- Every rejection is an `IllegalTransitionError` whose `from` is the input stage and whose `to` is the requested stage.
- Every returned state parses against `runStateSchema`.

## How to test

`bun test src/run-state` runs every scenario in the run-state spec under an injected clock. `bun check src/run-state/run-state.ts` type-checks the module and `bunx biome check src/run-state` lints and format-checks it.

## Known gaps

- A clock earlier than the derived stage start gives a negative duration. The module does not clamp or reject it, so a state built that way fails `completedStageSchema` when parsed.
- There is no way to skip a stage. A step that is turned off, such as code review with the model disabled, still has to be advanced through and records a short duration.
- `runId` is a plain string and is not checked for emptiness.
- Nothing is persisted or loaded. A run that restarts begins again at `resolving-pull-request`.
