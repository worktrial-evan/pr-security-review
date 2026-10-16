# Design

## Context

See proposal.md for motivation. The pipeline is the only module that may import every detector, and the CLI may import the pipeline but not `llm`, `lockfile` or the detectors. The matcher and the code reviewer are not on main yet.

## Goals / Non-Goals

**Goals:**

- One function per step, each testable alone, composed by `runReview`
- A degraded run still produces a valid result and a full audit log
- The two missing detectors can be wired by replacing one default each

**Non-Goals:**

- Parallel steps. Steps run one after another
- Rendering inside the pipeline. The CLI renders, so the server and the benchmark reuse the same result

## Decisions

### runStep and the run record

`runReview` keeps one mutable run record: the run state, step durations, errors, degraded steps, prompt versions, model ids and counters. `runStep({ runRecord, step, stage, input, isFatal, fallback, run })` advances the run state to the step's stage when it differs, writes step-start with the sha256 of the input, runs the step, writes step-end with the sha256 of the output and the duration, and records the duration. On a throw it writes step-error. A fatal step throws a `ReviewAbortedError` that `runReview` turns into the failed result. A non-fatal step records the error and the degraded step and returns its fallback.

Hashes go through one stable serializer that turns a `Map` into its entries and a `Set` into its values, so equal inputs hash equal.

Alternative: one try and catch per step inside `runReview`. Rejected because every step would repeat the audit and run-state code.

### Detectors as an injectable record

`runReview` takes `detectors?: Partial<ReviewDetectors>` with `matchDependencies`, `detectSecrets` and `reviewCode`. The defaults are `createLockfileMatcher()`, the real secrets detector and `reviewCodeWithReviewer`. Tests replace one with a function that throws.

`createLockfileMatcher({ runOracle })` takes the oracle as a parameter, so tests run without osv-scanner and one test runs against it when it is installed. The matcher only says a version is new. The step also matches the base set and sets aside a finding whose advisory or alias already affected the package at base, the rule `docs/benchmark.md` scores by. Doing it in the pipeline leaves the merged matcher untouched.

### Metered llm client

`createMeteredLlmClient({ llmClient, costMeter, maxCostUsd })` wraps a client. It adds each call's cost to the shared meter and, when `maxCostUsd` is set, throws `ReviewCostLimitError` before a call once the meter has reached it. The review client gets the limit and the summarize client does not. The meter's total is `totalCostUsd`.

### Settings

`readReviewConfig(path)` parses `config/review.json` with a zod schema. `buildReviewSettings({ reviewConfig, modelConfig, overrides })` returns the `ReviewOptions`, the limits and the prompt version, so the CLI and the benchmark apply flags in one place. `findMissingApiKeys(modelIds)` maps a model's provider to its key name. The CLI reads `config/models.json` through a pipeline export, because the CLI may not import `llm`.

### CLI shape

`createProgram(handlers)` builds the commander program and parses flags into typed options, then calls a handler. Tests pass recording handlers and never touch the network. `index.ts` passes the real handlers and sets the exit code.

## Risks / Trade-offs

- [The cost limit stops the reviewer mid-review] → the code-review step fails and is listed as degraded instead of spending past the limit
- [A cost limit checked before a call cannot stop the call that crosses it] → the limit bounds the spend to the limit plus one call
- [Hashing a large dependency set costs time] → the hash runs once per step over data already in memory
- [The benchmark default advisory path changes] → covered by the runner test that names the default
