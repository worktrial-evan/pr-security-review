# Proposal

## Why

Every module exists on its own, but nothing runs a review from a pull request link to a report. The agent needs one pipeline that composes the modules in order with a full audit trail, a CLI to run it, and a benchmark baseline recorded before any tuning.

## What Changes

- New `runReview` in `src/pipeline`, a `ReviewPipeline`. One file per step, each step under a run-state stage, every step wrapped by `runStep` with step-start, step-end or step-error audit events carrying input and output hashes and the duration
- A detector failure becomes a non-fatal step error and a degraded step, and the run continues. A failure describing the pull request or collecting its files aborts the run with a fatal error
- Per-run limits for a hostile pull request author in `config/review.json`: `maxChangedFiles` 200, `maxFileBytes` 1,000,000 and `maxReviewCostUsd` 2.00, plus `reviewPromptVersion`, the live code-review prompt version
- Dedupe across detectors before summaries
- New CLI in `src/cli` on commander: `review`, `benchmark run`, `benchmark show`, `refresh-advisories` and `validate-matcher`, wired into `index.ts`
- `suspectedPromptInjectionCount` on `ReviewMetadata`, shown in the report header. This is the one shared contract edit
- The secrets detector skips added lines over 4,000 characters and reports them, so the pipeline writes an audit note
- `.env.example`, the README How to run section, `docs/decisions.md` entries

Open details settled with the simplest option that meets the brief:

- `add-vulnerability-matcher` is wired in. The matching step runs the hand-written matcher per changed lockfile, cross-checks it with osv-scanner on the head copy of the lockfile against a temporary database of the installed packages' advisories, and reconciles the two. An unavailable osv-scanner degrades the step
- `add-code-review-detector` is wired in. The code-review step runs `reviewCode` at `reviewPromptVersion`, through a new optional `promptVersion` on `reviewCode`, since the reviewer otherwise loads the highest version present. A chunk whose answer failed validation twice degrades the step
- Current Claude models reject a non-default temperature, so the llm provider sends temperature 0 only to fireworks models. Reruns are reproduced by the response cache
- `config/models.json` gets the published prices: Sonnet 5.5 at $2 and $10 per million input and output tokens, Haiku 5.5 at $0.10 and $0.50
- A dependency finding whose advisory or an alias of it already affected the same package at base is pre-existing, as `docs/benchmark.md` defines an introduced dependency finding. The matching step matches the base lockfile for this
- The same package, version and advisory found in two lockfiles is reported once
- `validate-matcher` runs `scripts/validate-matcher.ts` as a child process, since `src/cli` cannot import `scripts`
- `bun index.ts benchmark run` matches against the corpus fixture `benchmark/fixtures/advisories/advisories.json`, indexed into a temporary advisory cache, because the committed cache layout under `benchmark/fixtures` is a different subset that lacks nine corpus advisories
- The run-state contract has ten stages and the pipeline has eleven steps. Loading advisories runs under `matching`, dedupe runs under `summarizing` and assembling the result runs under `rendering`. Adding stages would be a second shared edit
- `runReview` takes the `ReviewPipelineOptions` fields plus optional `runId`, `reviewPromptVersion`, `limits`, `llmProvider`, `modelConfig`, `detectors` and `now`. The extra fields keep it assignable to `ReviewPipeline`
- An aborted run returns a `ReviewResult` with one fatal error and no findings instead of throwing. The CLI exits 2 on it, and the benchmark wrapper throws so the runner records a failed case
- `advisoryCacheDir` is the cache root that holds `advisories/npm/`, the directory `loadAdvisoryStore` takes. The benchmark default pointed one level too deep at `benchmark/fixtures/advisories` and is fixed to `benchmark/fixtures`
- The advisory store is only loaded when the pull request changes a lockfile. The full index costs about 1.4 GB of memory
- The file limits apply to the files secrets and code review read. Lockfiles are parsed whatever their size
- `maxFileBytes` counts the UTF-8 bytes of a file's hunk lines, the text the detectors read
- `maxReviewCostUsd` is enforced by a metered llm client around the review model that refuses a call once the run's spent cost reaches the limit
- With the llm off, summaries come from the summarize module's templates
- `--out` is the runs directory. A review writes `<out>/<runId>/audit.jsonl` and `<out>/<runId>/report.html` or `report.json`
- `benchmark run --split all` runs dev then test under one label

## Capabilities

### New Capabilities

- `review-pipeline`: one review from pull request source to `ReviewResult`, with steps, run state, audit trail, degraded runs, dedupe and hostile-input limits

### Modified Capabilities

- `cli`: the review, benchmark and refresh-advisories commands
- `review-configuration`: the limits and the live code-review prompt version
- `review-report`: the header shows the suspected prompt injection count
- `shared-contracts`: `ReviewMetadata` gains `suspectedPromptInjectionCount`
- `secrets-detection`: added lines over 4,000 characters are skipped and reported

## Impact

- New files under `src/pipeline/` and `src/cli/`, `index.ts` and `index.test.ts` rewritten, `tsconfig.root-files.json` also references `src/cli`
- `src/shared/review.ts` and its test, named here as the one shared edit. The fixtures that build a `ReviewMetadata` gain the field: `src/report/fixtures/review-result.ts` and `src/benchmark/stub-pipeline.ts`
- `src/secrets/detect-secrets.ts`, `src/report/render-header.ts`, `src/benchmark/run.ts` as the small integration fixes above, `src/advisories/refresh-advisories.ts`, which exports its cache writer as `writeAdvisoryCache`, `src/code-review/review-code.ts` and its test harness for `promptVersion`, and `src/llm/ai-sdk-llm-provider.ts` for the temperature
- `config/review.json`, `config/models.json` prices, `.env.example`, `README.md` How to run section, `docs/decisions.md`
- No new dependency. `commander` is already installed
