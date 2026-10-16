# Design

## Context

See proposal.md for why. The current `README.md` mixes finished sections with placeholders. Its module graph is the allowed-imports matrix from `.dependency-cruiser.cjs`, which grants more than the code uses. A first module-level depcruise pass shows the gap. In non-test code, `pipeline` imports neither `report`, `prompts` nor `pull-request-source`, and `benchmark` does not import `pipeline`. The `harness` and `server` modules hold only an `AGENTS.md` and a `tsconfig.json`.

Facts that shape the approach, as observed:

- `docs/benchmark-log.md`, named by the brief as the results source, does not exist. The baseline lives in [docs/benchmark.md](../../../docs/benchmark.md) and in `benchmark/results/baseline-dev.json` and `baseline-test.json`. No improvement change has merged, and `prompts/code-review` holds only `v1.md`.
- `.env` in this worktree sets `ANTHROPIC_API_KEY`. `GITHUB_TOKEN` and `PULL_REQUEST_REVIEW_CACHE_DIR` are empty. The cache falls back to `~/.cache/pull-request-review`, which holds only `benchmark-repos`, so no model response is cached yet.
- osv-scanner is on PATH, so `validate-matcher` and the oracle cross-check can run.
- Anthropic requests send no temperature (docs/decisions.md, 2026-10-15). Temperature 0 goes only to fireworks models.
- The repository is linear: `main` has no merge commits, and this worktree sits at `795f30d`, the head of `main`.

## Goals / Non-Goals

**Goals:**

- A reader who opens only `README.md` can follow one review from pull request link to report, and can find the file behind every claim in one click.
- Every diagram and number can be checked against the merged code or a committed results file.

**Non-Goals:**

- Fixing any mismatch between a doc and the code. Mismatches are listed, not fixed.
- Rewriting module `AGENTS.md` files beyond broken links.
- A Mermaid renderer, a link checker or any other tool committed to the repository.
- Describing the harness, the server, CI outputs or the code-review improvement as if they existed.

## Decisions

### D1. One README, plus one supporting file under docs/architecture

The README holds all sixteen sections, each kept short. Depth stays in the module `AGENTS.md` files and in `docs/benchmark.md`, which the README links instead of repeating. The only new file is `docs/architecture/module-imports.md`. It holds the exact depcruise command and its module-level edge list, so a reviewer can check the flowchart without rerunning anything.

Alternative: split the security model and extension points into their own files under `docs/architecture/`. Rejected because the brief asks for one document an evaluator reads cold, and both sections stay short when they link out.

### D2. The module flowchart is drawn from depcruise, not from the matrix

The command is `bunx depcruise src index.ts --config .dependency-cruiser.cjs --collapse '^src/[^/]+' --exclude '\.test\.ts$' --output-type text`, keeping only the lines whose target is under `src/`. Test files and fixtures are excluded, so the graph shows production imports. The reachability fixtures otherwise add made-up package names. Arrows into `shared` are left out of the flowchart and stated in one sentence, because nearly every module imports it and nineteen extra arrows would hide the structure. `harness` and `server` appear in a separate "not implemented" group with no arrows.

Layers are grouped as entry points (`index.ts`, `cli`), orchestration (`pipeline`, `run-state`, `audit`), inputs (`pull-request-source`, `advisories`, `lockfile`), detectors (`matcher`, `reachability`, `secrets`, `code-review`), the model layer (`llm`, `prompts`, `summarize`), output (`report`), evaluation (`benchmark`) and contracts (`shared`). The exact grouping is settled when the edges are in hand, and every edge in the diagram must appear in `docs/architecture/module-imports.md`.

Alternative: keep the matrix graph. Rejected because the brief asks for real imports, and the matrix shows edges the code does not use.

### D3. Mermaid with flowchart and sequenceDiagram only

Every diagram uses `flowchart` or `sequenceDiagram`. The current `graph LR` becomes `flowchart LR`. Node ids are plain camelCase words. Labels are quoted text with no HTML, no `<br>` and no parentheses outside quotes. Edge labels use `-->|text|`. Subgraph ids get a quoted title. In sequence diagrams, participant aliases avoid the reserved words `end`, `loop`, `alt`, `opt` and `note`, and messages avoid semicolons and `#`, which Mermaid reads as syntax. Each block is checked by eye against these rules, as the brief asks, with no renderer installed.

### D4. Every Quick start command is run first, and its output is the source

Commands run from the worktree root with output captured to the scratchpad. Each one is written into the README only after it has run, and its real exit status and output files are what the README states. The planned runs:

- `bun install`, `cp .env.example .env` (shown only, since `.env` exists here), `bun index.ts refresh-advisories` and `bun run refresh-advisories`.
- `bun index.ts review https://github.com/axios/axios/pull/11321` with the default HTML report, and again with `--format json --fail-on low` to show exit status 1 if it reports an introduced finding at low or above. The exit status is recorded as observed.
- `GITHUB_TOKEN= bun index.ts review axios/axios#11294 --no-llm` and the same pull request with the model, the two cases the README already cites.
- `bun index.ts benchmark run --split all --label readme-check`, then `bun index.ts benchmark show`, then a dev-split run with `--review-prompt-version 1`. Results files written by these runs are not committed. `benchmark/results/latest-*.json` is restored with `git checkout` afterwards, because the committed latest files are the baseline.
- `bun run benchmark:validate` and `bun index.ts validate-matcher`.
- `bun index.ts` with no arguments, for the help text.

The run "with a token" needs a `GITHUB_TOKEN`, which this worktree does not have. If none is set when the task runs, the README still shows the command, and the summary says it was not run.

### D5. Numbers come from results files, docs that cite them, or command output

Results use `benchmark/results/baseline-dev.json` and `baseline-test.json`, the same numbers as `docs/benchmark.md`. Cost per pull request is the run's `totalCostUsd` divided by the case count, computed with a `jq` command over the results file and written to two significant figures. The command is shown in a short note under the table, so the number traces to an output. The "after" row reads "pending" with a link to nothing, because the improvement change has not merged. Observed costs for the axios reviews come from the runs in D4, not from the old README.

### D6. Links are relative and checked by a throwaway script

Every module links to `src/<module>/AGENTS.md`, and every file named links to its path, written as `src/x/y.ts`, not `./src/...`. In-page links use GitHub's heading anchors. A Bun script in the scratchpad extracts every `](target)` from `README.md` and `docs/architecture/module-imports.md`. It resolves each non-http target against the file's directory, checks that the path exists, and for `#anchor` checks that a heading slugs to it. The same script then runs over every `AGENTS.md` to find broken links to fix. It is never committed.

### D7. Section content plan

Each section is a short lead paragraph, its diagram or table if it has one, and links. Nothing is restated that a linked `AGENTS.md` already says in detail.

1. **What it is.** The three detectors with industry names: dependency scanning (SCA), LLM code review (a form of SAST) and secrets scanning. Deterministic parts: lockfile parsing, matching, reachability, secrets, dedupe, scoring and rendering. Model calls: code review and summaries. Status line: the baseline is measured, the harness, server and improvement are not built.
2. **Quick start.** The commands from D4, the `.env.example` variables, outputs (`runs/<runId>/report.html` or `report.json` and `audit.jsonl`) and exit codes 0, 1, 2, 130 and 143 from `src/cli/review-outcome.ts` and `src/cli/signal-cancellation.ts`.
3. **Architecture.** The D2 flowchart. The two rules: only `pipeline` composes detectors, and detectors never import each other. They are enforced by `.dependency-cruiser.cjs` through `scripts/check-boundaries.ts`, by the per-module `tsconfig.json` references, by `lefthook.yml` running `bun run verify`, and by CI. Link `docs/decisions.md` for the experiment.
4. **One review, step by step.** A `sequenceDiagram` built from `src/pipeline/run-review.ts` and `src/pipeline/run-step.ts`, with the eleven steps under the ten stages. Then one short paragraph per step naming its stage, the step file, the detector module's `AGENTS.md`, and the audit notes it writes beyond step-start and step-end.
5. **Deterministic and model-driven parts.** A table of each part and whether it calls a model. Then the constraints on model output, each linked: the untrusted-content fence in `src/prompts/fence-untrusted.ts`, the zod output schema in `src/code-review/model-output.ts`, the vulnerability type allowlist, the grounding filter in `src/code-review/grounding.ts`, the summary validator in `src/summarize/validate.ts`, temperature as it really is (D3 context) and the response cache in `src/llm/llm-cache.ts`.
6. **A finding's life.** The contract in `src/shared/finding.ts`, then detector, grounding (code review only), dedupe in `src/pipeline/dedupe-step.ts`, summary, and the report row in `src/report/report-rows.ts`. Introduced versus pre-existing, including the base-advisory rule in the matching step and the fail-on rule.
7. **Security model.** A flowchart of four trust zones: the pull request author, who controls the diff and the head checkout; GitHub; the model provider; and the local machine with the cache, runs and `.env`. Then a table of attack, defense and file, and the residual risks.
8. **Benchmark.** A flowchart of three nested subgraphs: the pipeline inside a benchmark run inside the improvement loop, with the loop marked as manual today. The categories and label sources, the match rules linking `src/benchmark/match-rules.ts` and `src/benchmark/score.ts`, the splits, reproducibility through the cache and the measured variance from `docs/benchmark.md`.
9. **Results.** The baseline table per D5, plus a pending row.
10. **Improving the agent.** Prompts under `prompts/<id>/v<n>.md`, loaded and hashed by `src/prompts/prompt-loader.ts`. `reviewPromptVersion` and `--review-prompt-version`. The accept rule: a higher dev F1 beyond the measured noise of about 0.03, holding on test, and a cheaper run on a tie. Its source is `docs/benchmark.md` "Reading a score" and "Measured variance". The harness is not implemented.
11. **Audit log.** `runs/<runId>/audit.jsonl`, the `AuditEvent` fields, one real line from a run in D4 as the sink wrote it, with any secret-like value already replaced by its `sha256:` fingerprint, and how `src/audit/redact.ts` decides what to redact.
12. **Configuration.** `config/models.json` with its prices, `config/review.json` key by key, the environment variables, and the cache directory with its subfolders.
13. **Repository map.** The top-level directories, then the nineteen modules, one linked line each.
14. **Extension points.** Each one names the exact files: lockfile format, OSV ecosystem, detector, prompt version, model or provider, output format, and a database-backed `AdvisoryStore`. The files are confirmed by reading the code each one names.
15. **Gaps and limitations.** The brief's list, each confirmed against code or a module's Known gaps before it is written, plus any gap found while reading.
16. **What's next.** The remaining planned changes, named only as plans: the code-review improvement, the harness, CI outputs and the server UI. No dates or numbers.

### D8. Mismatches found so far

These go in the final summary and are not fixed here:

- `docs/benchmark-log.md` does not exist. Results come from `docs/benchmark.md` and `benchmark/results/baseline-*.json`.
- The root `AGENTS.md` says a harness runs experiments and an HTTP server exposes the agent. Both modules are empty.
- The current README's module graph is the matrix, not the real imports.
- The brief says temperature 0. Anthropic models run at their default temperature, and only fireworks models get 0. The "Why benchmark reruns are reproducible" section of `src/llm/AGENTS.md` still argues from temperature 0.
- `src/code-review/AGENTS.md` says the pipeline change that wires `reviewCode` to a source is not written yet. `src/pipeline/code-review-step.ts` wires it.
- `src/prompts/AGENTS.md` lists as gaps that `prompts/` ships no prompts and that no module calls `fenceUntrustedContent`. `prompts/code-review/v1.md` and `prompts/summarize/v1.md` ship, and code-review and summarize both fence.
- `src/cli/AGENTS.md` lists as a gap that the review command reads GitHub pull requests only. `review --repo <path> --base <sha> --head <sha>` opens a local repository in `src/cli/review-command.ts`.
- `src/benchmark/AGENTS.md` says the advisories module decides its cache format "when it lands". It has landed, and the benchmark command builds that layout per run.
- The brief says workspace packages are excluded from matching. No code filters them. A workspace version is `workspace:<path>`, which is not semver, and the matcher's range rules never count an unparseable version as affected, so they never match in practice.
- Design D7 item 11 first said redaction writes `[REDACTED]`. `src/audit/redact.ts` writes `sha256:` and the first 16 hex characters of the value's hash.

- `src/pipeline/AGENTS.md` lists as a known gap that reaching `maxReviewCostUsd` mid-review fails the code-review step and loses the findings already made. Its own invariants, `src/pipeline/code-review-step.ts` and the decision log say those findings are kept.
- `src/benchmark/benchmark-repository.ts` clones into `benchmark-repositories` in the cache, as `src/benchmark/AGENTS.md` says. A `benchmark-repos` folder from before the rename still sits in the local cache and is unused. This is local state, not a doc mismatch.
- The summary prompt version is pinned to 1 by a constant in `src/summarize/summarize-findings.ts`. No config key or flag selects it.

The Quick start "with a token" command was run with `GITHUB_TOKEN` loaded from the main checkout's `.env` through `bun --env-file`, because the worktree's `.env` holds no token. It exited 0, and no git config file under the cache and no file under `runs/` held the token afterwards.

## Risks / Trade-offs

- [Running the Quick start spends model credits and writes `benchmark/results/latest-*.json`] → Run the benchmark once uncached and once cached, so the second run is free. Restore the committed `latest-*` files with `git checkout`, and never stage files under `runs/` or `benchmark/results/` that a check run wrote.
- [A live run's numbers differ from the baseline because of model variance] → The Results section uses only the committed baseline files. Numbers from check runs are used only for cost and exit status claims, and are labeled with the run that produced them.
- [GitHub's 60 request an hour limit without a token] → Use a small number of reviews, and run the token-less form once.
- [The README drifts from the code as later changes land] → Each section links the `AGENTS.md` that a module change must update, and `docs/architecture/module-imports.md` holds the command to regenerate the edge list.
- [A Mermaid syntax error that only GitHub would show] → Use only the constructs in D3 and check each block against them by eye.

## Migration Plan

None. Documentation only. Rollback is reverting the commit.

## Open Questions

- Whether a `GITHUB_TOKEN` will be available when the task runs. Without one, the token form of the review command is shown but not run, and the summary says so.
