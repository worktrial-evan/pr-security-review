# pipeline module

## Purpose

Runs one pull request review end to end: eleven steps in order, each under a run-state stage and audited, from describing the pull request to a validated `ReviewResult`.

## Public API

### run-review.ts

- `runReview(options)`: reviews one pull request and returns a `ReviewResult` that parses against `reviewResultSchema`. It takes the `ReviewPipelineOptions` fields plus optional `runId`, `now`, `runSettings`, `llmProvider`, `llmCacheDirectory`, `refreshAdvisoryCache` and `detectors`, so it is assignable to `ReviewPipeline`
- `reviewPipeline`: `runReview` typed as the shared `ReviewPipeline`
- `RunReviewOptions`: its options
- `ReviewDetectors`, `defaultReviewDetectors`: the detectors a run calls, `matchDependencies`, `detectSecrets` and `reviewCode`. Matching defaults to `createLockfileMatcher()` and code review to `reviewCodeWithReviewer`

### run-step.ts

- `runStep(options)`: moves the run state to the step's stage, writes step-start with the input hash, runs the step and writes step-end with the output hash and duration, or step-error. A fatal step throws `ReviewAbortedError`. Any other step records a non-fatal `StepError` and a degraded step and returns its fallback
- `RunStepOptions`: the record, the step, the input, the work and either `isFatal: true` or `isFatal: false` with a `fallback`
- `reviewSteps`, `ReviewStep`: the eleven step names in run order
- `stagesByStep`: the run-state stage each step runs under
- `advanceToStage({ runRecord, stage })`: moves the run state forward one stage at a time to the given stage
- `ReviewAbortedError`, `ReviewAbortedErrorOptions`: the error a fatal step throws, holding the step

### run-record.ts

- `RunRecord`: the mutable record of one run: run state, step durations, errors, degraded steps, prompt versions, model ids, grounding rejections, suspected prompt injections and the cost meter
- `createRunRecord({ runId, auditSink, now })`, `CreateRunRecordOptions`: a record at `resolving-pull-request`
- `createRunId(startedAt)`: `YYYYMMDD-HHMMSS-` and eight random hex characters
- `addDegradedStep({ runRecord, step, reason })`, `AddDegradedStepOptions`: adds one `step: reason` entry
- `writeRunNote({ runRecord, step, payload })`, `WriteRunNoteOptions`: writes one note event

### review-settings.ts

- `reviewConfigSchema`, `ReviewConfig`, `defaultReviewConfigPath`, `readReviewConfig(path)`: the strict schema of `config/review.json` and its reader
- `ReviewLimits`: `maxChangedFiles`, `maxFileBytes` and `maxReviewCostUsd`
- `loadReviewSettings({ overrides, reviewConfigPath, modelConfigPath })`: reads both config files and returns `ReviewSettings` with the overrides applied. `advisoryCacheDirectory` defaults to `resolveCacheDirectory()` and `isOffline` to false
- `ReviewSettings`, `RunSettings`, `ReviewSettingsOverrides`, `LoadReviewSettingsOptions`: the settings of a run, the part besides the review options, the flags that may change one run, and the reader options

### api-keys.ts

- `findMissingApiKeys({ reviewOptions, environment })`, `FindMissingApiKeysOptions`: the api key variables the two configured models need and the environment lacks, none when the llm is off
- `apiKeyEnvironmentVariablesByProvider`: `ANTHROPIC_API_KEY` and `FIREWORKS_API_KEY` by provider

### run-audit-log.ts

- `openRunAuditLog({ runId, runsDirectory })`, `RunAuditLog`, `OpenRunAuditLogOptions`: the redacting JSONL audit log of a run at `<runsDirectory>/<runId>/audit.jsonl`, for the CLI, which may not import `audit`

### metered-llm-client.ts

- `createMeteredLlmClient({ llmClient, costMeter, maxCostUsd })`, `CreateMeteredLlmClientOptions`: a client that adds each call's cost to the meter and throws `ReviewCostLimitError` before a call once the meter has reached `maxCostUsd`
- `CostMeter`, `ReviewCostLimitError`, `ReviewCostLimitErrorOptions`: the shared spend and the refusal

### llm-clients.ts

- `createReviewLlmClients(options)`, `ReviewLlmClients`, `CreateReviewLlmClientsOptions`: the review and summarize clients of a run, both metered and only the review client held to the limit, or undefined when the llm is off

### Steps

- `describe-step.ts`: `describePullRequest(source)`, the description parsed through the contract
- `collect-files-step.ts`: `collectFiles({ pullRequestSource, limits })`, `applyFileLimits({ changedFiles, limits })`, `countHunkBytes(changedFile)`, `CollectedFiles`, `WithheldFile`, `withheldFileReasons`. The first `maxChangedFiles` files within `maxFileBytes` of hunk text each are the reviewed files, and the rest are withheld
- `lockfile-step.ts`: `parseLockfiles({ pullRequestSource, changedFiles })`, `LockfileChange` with both dependency sets and the diff, `ParsedLockfiles`. Every changed lockfile that still exists is parsed at head and base with the `package.json` beside it and diffed. An added lockfile has an empty base. Unsupported lockfiles are listed
- `advisory-step.ts`: `loadAdvisories(options)`, `AdvisoryLoad`, `RefreshAdvisoryCache`. Loads the store only when a lockfile changed, refreshes a missing or stale cache unless offline, and fails offline without a cache
- `matching-step.ts`: `createLockfileMatcher({ runOracle })` returns the `MatchDependencies` the pipeline runs. Per changed lockfile it runs the matcher module's `matchDependencies` on the head set, sets aside a finding whose advisory or an alias of it already affected the same package at base, writes the advisories of every installed package into a temporary osv-scanner database, runs the oracle on the head copy of the lockfile and reconciles the two with `reconcileMatches`. An unavailable oracle degrades the step once per lockfile. `runOracle` defaults to the matcher's osv-scanner runner. Also `LockfileMatches`, `MatchDependenciesOptions`, `DependencyMatching`, `RunOracle` and `CreateLockfileMatcherOptions`
- `reachability-step.ts`: `classifyDependencyFindings(options)` scans the head checkout once when the matcher found anything and classifies each finding, and `toDependencyFinding(options)` builds the dependency finding from the matcher's `DependencyFinding` with an id over the lockfile path, installed name, version and advisory id
- `secrets-step.ts`: `runSecretsDetector(options)`, `DetectSecrets`. Notes every added line too long to scan, then runs the detector over the reviewed files
- `code-review-step.ts`: `runCodeReview(options)` skips the review with a note when the llm is off and otherwise calls the reviewer. `reviewCodeWithReviewer(options)` runs the code-review module's `reviewCode` at the live prompt version and degrades the step when a chunk's answer failed validation twice. Also `ReviewCode`, `ReviewCodeOptions`, `CodeReviewOutput` and `emptyCodeReviewOutput`
- `dedupe-step.ts`: `dedupeFindings(findings)`, `DedupedFindings`, `DroppedFinding`, `dedupeReasons`, `hardcodedCredentialVulnerabilityTypes`. Drops a repeated id, a dependency finding for a package, version and advisory a second lockfile already reported, a code-review finding in a manifest or lockfile that names a package a dependency finding reports, and a hardcoded credential finding over a line a secrets finding reports
- `summarize-step.ts`: `summarizeReviewFindings(options)`, `SummarizeStepOutput`. Looks up each dependency finding's advisory by id or alias, then summarizes with the model or, with the llm off, from the summarize module's templates
- `assemble-step.ts`: `assembleReviewResult(options)`, the metadata copied from the run record and the result parsed through `reviewResultSchema`

### Test support

- `pipeline-fixtures.ts`: `createMemoryAuditSink()`, `testRunSettings`, `testReviewOptions` with the two priced test model ids, `writeSnapshotPullRequest()` that bumps the bun lockfile fixture, adds a token and a 5,000 character line, `removeSnapshotPullRequest`, `makeTestClock()` and `testGithubToken`

## Inputs and outputs

`runReview` reads a pull request through the `PullRequestSource` contract, the advisory cache under `ReviewOptions.advisoryCacheDirectory` (the directory holding `advisories/npm/`), `config/review.json` and `config/models.json` unless `runSettings` is given, and the model provider through `createLlmClient`. It writes every event to the given `AuditSink` and returns a `ReviewResult`.

The audit trail of one run, in order: a step-start and a step-end or step-error event per step with the step name, its stage, the input hash, the output hash and `durationMs`. Between them the notes and events the steps write: one `lockfile matched` note per lockfile with the finding count, the matcher's skipped withdrawn advisories and GIT ranges and the oracle status, the reachability scan note, one `added line skipped for length` note per line over 4,000 characters, `code review skipped because the llm is disabled`, one `finding dropped` note per deduped finding with its reason, and the llm client's `llm-call` events. Then one `finding` event per finding in the result, and a final note under the step `run`, `run finished` with the completed stages or `run aborted` with the failed step.

`metadata.degradedSteps` holds `step: reason` entries: a withheld file, an unsupported lockfile, an osv-scanner cross-check that could not run, a changed lockfile without an advisory store, code-review chunks skipped after a failed answer, a failed step, or summary calls that fell back to templates. `metadata.promptVersions` and `metadata.modelIds` are keyed by prompt id and step and hold only what ran.

## Allowed imports

shared, audit, run-state, pull-request-source, lockfile, advisories, matcher, reachability, secrets, prompts, llm, report, code-review, summarize

Bun and Node built-ins and npm packages are always allowed.

## Files

- `run-review.ts`: `runReview`, the step order, the record of what each step adds, the finish and the abort
- `run-review.test.ts`: every step started and ended in order with hashes, a valid result with the summarized secret and the advisory snapshot, a grounded review finding kept with its rejection and injection counted, the overlong line note, a throwing detector degrading the run, an aborted run, and a run with the llm off making no model call
- `run-step.ts`: `runStep`, the stage moves, the step events and the failure paths
- `run-step.test.ts`: the audited success path, a degraded failure with its fallback, a fatal failure, passing through stages and rejecting an earlier one
- `run-record.ts`: the run record, the run id, degraded entries and notes
- `review-settings.ts`: the review config schema and reader, and the settings builder
- `review-settings.test.ts`: the eight checked-in keys, a rejected unknown key, the defaults, every override and the api key check
- `api-keys.ts`: the api key variables by provider and the missing key check
- `run-audit-log.ts`: the JSONL audit log of a run
- `stable-hash.ts`: `hashValue` and `toStableJson`, sha256 over JSON with sorted keys, maps as entries and sets as values
- `stable-hash.test.ts`: key order, maps and sets, undefined and functions
- `metered-llm-client.ts`: the cost meter, the metered client and the cost limit error
- `metered-llm-client.test.ts`: costs added to the shared meter, a missing price as zero, and a refused call that never reaches the model
- `llm-clients.ts`: the review and summarize clients of a run
- `describe-step.ts`, `collect-files-step.ts`, `lockfile-step.ts`, `advisory-step.ts`, `matching-step.ts`, `reachability-step.ts`, `secrets-step.ts`, `code-review-step.ts`, `dedupe-step.ts`, `summarize-step.ts`, `assemble-step.ts`: one file per step
- `collect-files-step.test.ts`: the count limit, the byte limit and multibyte text
- `lockfile-step.test.ts`: a bumped, an added, a deleted and an unsupported lockfile
- `matching-step.test.ts`: nothing to match, a lockfile without a store, the oracle reading the head copy with agreement marked, an unavailable oracle, and an advisory that already affected the base set aside
- `advisory-step.test.ts`: not needed, offline with a stale and with no cache, a refreshed missing cache, a kept fresh cache and a refreshed stale one
- `reachability-step.test.ts`: no checkout without findings, a direct-imported match from the snapshot head, and a valid finding with a stable id
- `dedupe-step.test.ts`: a repeated id, a version two lockfiles repeat, a bump reported twice, another package kept, a credential reported twice and nothing repeated
- `pipeline-fixtures.ts`: the test support above
- `tsconfig.json`: the module's composite TypeScript project, referencing its row of the matrix
- `AGENTS.md`: this file

## Invariants

- Nothing from the reviewed repository is ever installed or executed. The pipeline reads files from the source and its head checkout as text and parses them. The only program it starts is osv-scanner, which reads one lockfile offline against a database the pipeline writes. It never runs a package manager, a script, a build or a test from the repository.
- Only this module composes the detectors. A detector receives data and never imports another detector.
- Steps run in the order of `reviewSteps`, and the run state only moves forward through `advanceRunState`. A finished run ends at `done` and an aborted run at `failed`.
- Every step that starts writes exactly one step-end or one step-error event.
- Only describing the pull request, collecting its files and assembling the result are fatal. Every other failure becomes a non-fatal `StepError` and a degraded step, and the run continues with the step's fallback.
- Every returned result parses against `reviewResultSchema`, including an aborted one.
- The secrets and code-review detectors read only the reviewed files. Lockfiles are parsed whatever the limits say.
- No review model call starts once the run's metered cost reaches `maxReviewCostUsd`.
- The advisory store is only loaded when a lockfile changed.

## How to test

`bun test src/pipeline` runs every test offline: the sources are snapshot trees under the OS temp directory, the advisories are the committed fixture under `benchmark/fixtures`, and the model is the llm module's fake provider. `bun check src/pipeline/run-review.ts` type-checks the module and `bunx biome check src/pipeline` lints it.

## Known gaps

- Reaching `maxReviewCostUsd` in the middle of a review fails the code-review step. The findings of the chunks already reviewed are lost with it.
- Without osv-scanner on PATH every changed lockfile degrades the matching step and the findings are `oracle-unavailable`.
- A lockfile in two formats for one project reports each vulnerable version once. The copy from the lockfile matched later is dropped by dedupe.
- The cost limit is checked before a call, so the call that crosses it still runs. Calls that fail output validation report no cost, so their spend is not metered.
- A lockfile without a `package.json` beside it is parsed against an empty manifest, so no dependency is direct.
- Steps run one after another. Secrets and code review could run in parallel.
- `maxFileBytes` counts hunk text, not the size of the file at head.
