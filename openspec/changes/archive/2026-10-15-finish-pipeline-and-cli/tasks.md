# Tasks

## 1. Review command forms and output

- [x] 1.1 `--repo <path> --base <sha> --head <sha>` on `review`, accepted only together and only without the argument, with parsing tests for the local form, the mixed form and the incomplete form. Verify with `bun test src/cli/program.test.ts`
- [x] 1.2 The review command opens a git source over the local repository with no GitHub call and no token, tested over a temporary repository. Verify with `bun test src/cli/review-command.test.ts`
- [x] 1.3 `--out` names the run directory, default `runs/<runId>`: `JsonlAuditSink` and `openRunAuditLog` take a run directory, the report is written beside the log. Verify with `bun test src/audit src/cli/review-command.test.ts`
- [x] 1.4 `runCli` prints an escaped error as one sanitized line and returns 2, tested with a throwing handler. Verify with `bun test src/cli/program.test.ts`
- [x] 1.5 `refresh-advisories` prints through the sanitized output: the command takes a line writer and the handler passes the output. Verify with `bun test src/advisories src/cli`

## 2. Cost limit

- [x] 2.1 The metered client adds the usage of a validation error to the meter before rethrowing. Verify with `bun test src/pipeline/metered-llm-client.test.ts`
- [x] 2.2 `reviewCode` takes `isStopError` and reports `unreviewedFiles`, keeping the findings of the finished chunks. Verify with `bun test src/code-review`
- [x] 2.3 The code-review step passes the cost limit predicate, keeps the findings and lists the unreviewed files under the degraded steps. Verify with `bun test src/pipeline/run-review.test.ts`

## 3. Shared cache files

- [x] 3.1 `cache/` in `.gitignore`, `PULL_REQUEST_REVIEW_CACHE_DIR=` under the brief's comment in `.env.example`, the cache sentence in `openspec/config.yaml` replaced with the brief's wording. Verify with `git check-ignore cache/x` and by reading both files
- [x] 3.2 The cache sentences in the root `AGENTS.md` and `docs/decisions.md` say the cache is the gitignored `cache/` folder in the main checkout shared by every worktree, with the fallback kept. Verify by reading them

## 4. Cancellation

- [x] 4.1 `run-cancellation.ts`, `cancelledBy` on the run record, `ReviewCancelledError` in `runStep` and the listener in `runReview`, with tests for a cancellation during secrets and after the run finished. Verify with `bun test src/pipeline/run-review.test.ts src/pipeline/run-step.test.ts`
- [x] 4.2 `runUntilSignal` with an injectable signal source and exit, tested for 130 on SIGINT, 143 on SIGTERM and listeners removed after a normal end. Verify with `bun test src/cli/signal-cancellation.test.ts`
- [x] 4.3 The review command runs under the watch: the cancellation test sends SIGINT mid-run with the fake provider and finds the cancelled note as the last line of the log, exit code 130, no report and no leftover worktree. Verify with `bun test src/cli/review-command.test.ts`
- [x] 4.4 `runBenchmark` takes an abort signal, a warning writer and a token, the clones pass the token to git through the environment, and the benchmark command cancels the current case on a signal, tested for no results file and for the token. Verify with `bun test src/benchmark src/cli/benchmark-command.test.ts`

## 5. Documentation and verification

- [x] 5.1 README How to run: the cache variable and the shared folder, the local repository form, the run directory, the exit status on a signal, and the benchmark commands with and without a token. `docs/benchmark.md` running section names the token. Verify by running the documented commands' help
- [x] 5.2 `docs/decisions.md` entries for the cancellation channel, the run directory, the reviewer stop predicate and the escaped-error status. Verify by reading them against the code
- [x] 5.3 A real review runs with `PULL_REQUEST_REVIEW_CACHE_DIR` set to the checkout's `cache/` and `git status` shows nothing under `cache/`. Verify with `git status --porcelain`
- [x] 5.4 bun run verify passes. Verify with `bun run verify`
- [x] 5.5 module AGENTS.md updated: pipeline (the cancellation files and the sentence that a log without a final note means the process was killed outright), cli, benchmark, advisories, audit and code-review. Verify by reading each against its files

## Workflow follow-up

- Archive the change, commit once with the implementation and the archive, push to main
