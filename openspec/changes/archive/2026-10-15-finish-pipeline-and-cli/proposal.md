# Proposal

## Why

An audit of the `add-pipeline-and-cli` brief against main found the parts of the brief that were added after that change was built, and a few hardening holes its critic turned up. The agent is not finished until a Control-C leaves a clean log and no worktree, every worktree shares one cache, and the brief's command forms all work.

## What Changes

- Cancellation. On SIGINT or SIGTERM, `review` and `benchmark run` move the run to failed with the error `cancelled by <signal>`, write one last note with `status: cancelled`, the signal and the stage reached, flush it, dispose the pull request source and exit with 128 plus the signal number. A cancelled benchmark run writes no results file. The audit event contract is unchanged
- `review` accepts `--repo <path> --base <sha> --head <sha>` for a local repository, with no GitHub call and no token
- `--out <directory>` names the run directory itself, default `runs/<runId>`, as the brief says. Before, it named the parent and the run id was always appended
- `benchmark run` passes `GITHUB_TOKEN` to its clones
- An error that escapes a command prints one sanitized line and exits 2 instead of a stack trace. `refresh-advisories` and the benchmark's skip warnings print through the sanitizer too
- The cost limit keeps the findings of the chunks already paid for and lists the files it never reviewed under the degraded steps. A model call that ends in a validation error still adds its usage to the meter, so a diff that provokes off-schema answers cannot run unmetered
- The shared cache in the main checkout: `cache/` in `.gitignore`, `PULL_REQUEST_REVIEW_CACHE_DIR` in `.env.example` with the comment the brief gives, the cache sentence in `openspec/config.yaml` replaced, and the matching sentences in the root `AGENTS.md` and `docs/decisions.md` corrected. The resolver keeps its `~/.cache/pull-request-review` fallback
- README How to run: the cache variable, the local repository form, the new `--out` meaning, the exit codes on a signal, and the benchmark commands with and without a token

Two findings of the audit are deviations the user accepted on 2026-10-15 and stay as they are: eleven steps run under the ten run-state stages (`load-advisories` under `matching`, `dedupe-findings` under `summarizing`), and the advisory store is loaded only when a lockfile changed.

Open details settled with the simplest option that meets the brief:

- The CLI hands the pipeline a cancellation object and awaits its `cancel(signal)`. The pipeline answers by failing the run, writing the note and dropping every later event. An `AbortSignal` alone would give the CLI no way to wait for the note to reach disk
- The exit function is a parameter of the signal watch, so a test observes the code 130 in process without dying
- The reviewer takes a predicate naming the error it stops on and reports the files it did not finish, so the pipeline keeps the paid-for findings and lists the rest. Chunking and the cache keys do not change
- The JSONL audit sink takes an explicit run directory beside its runs directory and run id, so `--out` can name the directory itself. The benchmark keeps `runs/<runId>` per case
- An error that escapes a handler exits 2 for every command, the status the brief gives a run that could not finish
- The local repository form checks out the head into a temporary worktree of that repository, like the GitHub form, and removes it on dispose

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: the local repository form, the run directory, cancellation, the exit on an escaped error, the sanitizer over every command's output, and the token on benchmark clones
- `review-pipeline`: the cancelled run, what the cost limit keeps and lists, and metering of failed calls
- `benchmark-runner`: a cancelled run writes no results, and clones use the token when set

## Impact

- `src/pipeline`: a new `run-cancellation.ts`, `run-record.ts`, `run-step.ts`, `run-review.ts`, `code-review-step.ts`, `metered-llm-client.ts`, `run-audit-log.ts` and their tests, `AGENTS.md`
- `src/cli`: a new signal watch, `program.ts`, `review-command.ts`, `benchmark-command.ts`, `cli-handlers.ts` and their tests, `AGENTS.md`
- Small fixes outside those two modules, each listed here: `src/audit/jsonl-audit-sink.ts` takes a run directory; `src/benchmark/run.ts` takes an abort signal, a warning writer and a token, and `src/benchmark/benchmark-repository.ts` and `case-source.ts` pass the token to git; `src/advisories/refresh-advisories-command.ts` takes a line writer; `src/code-review/review-code.ts` takes a stop predicate and reports the files it did not finish
- `.gitignore`, `.env.example`, `openspec/config.yaml`, root `AGENTS.md`, `README.md`, `docs/decisions.md`, `docs/benchmark.md`
- No new dependency. No shared contract changes
