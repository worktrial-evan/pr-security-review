# Design

## Context

See proposal.md. The pipeline keeps one mutable run record per run and writes every event through the record's audit sink, which fsyncs each line. The CLI opens the sink and the pull request source and disposes both in a `finally`. A signal today kills the process before any of that runs. The CLI may import the pipeline and the benchmark but not the detectors.

## Goals / Non-Goals

**Goals:**

- A signal mid-run leaves a log whose last line is the cancelled note, no worktree, and the exit status a shell expects
- Every new behavior is testable in process with the fake provider

**Non-Goals:**

- Interrupting a model call in flight. The call is abandoned when the process exits
- A second signal handler for the server. The server change adds its own

## Decisions

### A cancellation object the CLI awaits

`createRunCancellation()` in `src/pipeline/run-cancellation.ts` returns `{ cancelledBy, onCancel(listener), cancel(signal) }`. `cancel` runs the listeners in registration order once and resolves when all have. `runReview` registers one listener at the start of a run: it reads the stage reached, moves the run state to failed with the error `cancelled by <signal>`, writes the note `{ message: 'run cancelled', status: 'cancelled', signal, stage }` through the real sink, then replaces the record's sink with one that drops events, so the note stays the last line. `runStep` throws `ReviewCancelledError` before starting a step on a cancelled record and `abortRun` returns the failed result for it without writing.

Alternative: pass an `AbortSignal` into `runReview`. Rejected because the CLI must wait for the note to be written before it disposes the source and exits, and an `AbortSignal` has no reply.

### The signal watch races the run

`runUntilSignal({ run, cancel, signalSource = process, exit = process.exit })` in `src/cli/signal-cancellation.ts` installs one listener each for SIGINT and SIGTERM, races `run()` against the first signal, and on a signal awaits `cancel(signal)`, calls `exit(128 + os.constants.signals[signal])` and resolves that code. It removes its listeners when the run ends on its own. The review command's `run` is the pipeline only: the report is written after the race, so a cancelled review writes none. Its `cancel` is the cancellation's `cancel`, the audit log's dispose, then the source's dispose.

The benchmark command keeps the current case's cancellation and source in a holder the per-case pipeline updates, aborts an `AbortController` the runner checks before each case and before writing results, and cancels the current case on a signal. `runBenchmark` throws the abort reason when it stops, so no results file is written.

Alternative: `process.exit` straight from the listener. Rejected because the note and the dispose are asynchronous and the test needs the exit code without exiting.

### The local repository form

The `review` argument becomes optional. `--repo <path>`, `--base <sha>` and `--head <sha>` are accepted only together and only without the argument, and commander reports the rule otherwise. The handler builds the git source over that repository directly: no GitHub call, no token, and the description carries no pull request reference. Its head checkout is a temporary worktree of that repository, removed on dispose, which is what the cancellation test watches.

### `--out` names the run directory

`openRunAuditLog` takes either `runsDirectory` plus `runId` or `runDirectory`, and `JsonlAuditSink` gains the matching option. The review command passes `runDirectory`, defaulting to `runs/<runId>`, and writes the report beside the log. The benchmark pipeline keeps `runsDirectory: 'runs'` per case.

### The reviewer stops on the cost limit and says what it skipped

`reviewCode` gains an optional `isStopError(error)` predicate and its result gains `unreviewedFiles`. When a chunk call throws an error the predicate accepts, the reviewer stops asking, keeps the findings and counters of the chunks that finished, and lists every file with an unfinished chunk. The pipeline passes a predicate for `ReviewCostLimitError`, keeps the findings and records `code-review: cost limit reached, <n> files not reviewed: <paths>` under the degraded steps. Chunking and the cache keys are unchanged.

Alternative: one reviewer call per file from the pipeline. Rejected because the reviewer packs files into chunks, so per-file calls would change every prompt and miss the response cache.

The metered client catches an error that carries the usage of its calls, prices that usage the way the llm client prices a result, adds it to the meter and rethrows, so a retried off-schema answer is paid for in the meter.

### Escaped errors and the sanitizer

`runCli` catches any error a handler lets through, writes `error: <message>` through the output and returns 2. `runRefreshAdvisoriesCommand` takes a `writeLine` and `runBenchmark` a `warn`, both defaulting to the console, and the CLI passes its sanitized output to each.

## Risks / Trade-offs

- [A step in flight keeps running after the note] → its events go to the dropping sink and the process exits right after the dispose. In a test the run ends at the next step boundary with `ReviewCancelledError`
- [A second signal during the cleanup] → the listeners are installed once and the second signal takes the default action, which kills the process. The log already holds the note
- [Per-file reviewer calls load the prompt per file] → the prompt is a small file read; the model calls and the cache keys are the same
- [`--out` changes a documented default] → the README and the archived spec are updated together, and `runs/<runId>` stays the default layout
