# Proposal

## Why

The repo is a bare `bun init` scaffold with no module layout, no shared contracts and no enforcement, so every later change would have to invent structure and would collide with the others in `package.json`, `tsconfig.json` and the types they share. This change lays down the modular monolith once, with the contracts every detector, the pipeline and the benchmark depend on, and makes the module boundaries mechanical: a pre-commit AST check and the TypeScript check both reject a cross-module import. After it lands, each later change can be built in its own worktree against stable contracts and frozen tooling files, and merged without touching anything another change touches.

## What Changes

- Add the module layout `src/<module>/` for all nineteen modules in the allowed-imports matrix (shared, audit, run-state, pull-request-source, lockfile, advisories, matcher, reachability, secrets, prompts, llm, report, code-review, summarize, pipeline, benchmark, harness, server, cli), each with an `AGENTS.md` from one template, even when the module has no code yet. Add the root directories `prompts/`, `benchmark/`, `config/`, `scripts/`, `docs/`. Gitignore `runs/`. `cache/` is not gitignored, because no cache lives in the tree (see the cache directory bullet below).
- Install every runtime and tooling dependency now, pinned to exact versions: zod, semver, @types/semver, ts-morph, jsonc-parser, fflate, commander, ai, @ai-sdk/anthropic, @ai-sdk/fireworks, @biomejs/biome, dependency-cruiser, lefthook. The existing `@types/bun` and `@fission-ai/openspec` entries are pinned too, and `typescript` moves from the 7.0 native build to a pinned 5.9 release, which still ships the JavaScript compiler API that dependency-cruiser parses `.ts` files through. After this, later changes never edit `package.json` or `bun.lock`.
- Add the shared contracts in `src/shared`, one file per concept: `finding.ts`, `pull-request-source.ts`, `dependency.ts`, `advisory.ts`, `audit.ts`, `run-state.ts`, `review.ts`, `llm.ts`, `benchmark.ts`. Each is a zod schema with its inferred type, discriminated unions for variants and branded ids. Field names may follow the code-style naming rules, but every field the request lists exists.
- Adopt the naming rule that pull request is never abbreviated in any name: `PullRequest` in types, `pullRequest` in values, `pull-request` in file and module names, and "pull request" in prose. The product name `pr-review` and the repository name `pr-security-review` are the two exceptions. The rule is stated in `openspec/config.yaml` and the root `AGENTS.md` so every later change follows it.
- Add `resolveCacheDirectory()` in `src/shared/cache-directory.ts`. Every cache (advisories, LLM responses, cloned benchmark repositories) lives outside the repository under one directory: `PULL_REQUEST_REVIEW_CACHE_DIR` when that variable is set and non-empty, else `~/.cache/pull-request-review`. Parallel worktrees then share one cache, and there is no `cache/` directory in the tree.
- Add `.worktreeinclude` at the root listing `.env` and `.env.local`, so a new worktree created by the desktop app receives both files even though `.gitignore` excludes them.
- Add `src/audit` with a JSONL audit sink that writes `runs/<runId>/audit.jsonl` one event per line, flushed per write, and redacts secret-like values to a sha256 fingerprint before writing.
- Add `src/run-state` with `createRunState` and `advanceRunState`, which reject an illegal stage transition with a typed error and allow `failed` from any stage.
- Replace the hello-world `index.ts` with a stub CLI entry that prints usage.
- Add tooling: `biome.json` (formatter and linter, no semicolons, single quotes, sorted imports), the `@/*` path alias in `tsconfig.json`, `.dependency-cruiser.cjs` encoding the allowed-imports matrix as forbidden rules, `scripts/check-file-headers.ts`, `lefthook.yml` pre-commit, and `bun run verify` running the same five checks in order: `bun check`, `biome check`, `check:boundaries`, `check:headers`, `bun test`.
- Add `.github/workflows/ci.yml` that runs `bun install --frozen-lockfile` then `bun run verify`.
- Try TypeScript project references, one per module, so `bun check` also rejects a cross-module import. Keep them only if `bun check` honors them, and record the outcome in `docs/decisions.md` either way.
- Add `config/models.json` (model id defaults and a zeroed price map) and `config/review.json` (review defaults).
- Fill `openspec/config.yaml` with the constraints every later change must obey and a tasks rule that the last two tasks of every change are "bun run verify passes" and "module AGENTS.md updated".
- Add the root `AGENTS.md` listing every module and pointing at the matrix, and a `README.md` skeleton with three Mermaid diagrams and empty headed sections. `README.md` joins the frozen files list, so a module change never rewrites it.
- Add tests: the boundary check fails on a bad-import fixture, the header check fails on a headerless fixture, the audit sink writes valid JSONL and redacts a fake token, run-state rejects an illegal transition, and every zod schema round-trips a sample value.

## Capabilities

### New Capabilities

- `module-boundaries`: which module may import which, no barrel files, and the check that fails on any violation.
- `verification-pipeline`: the single `verify` command, the file header rule, the pre-commit hook and CI all running the same checks.
- `shared-contracts`: the zod contracts in `src/shared` that every module builds against, including finding id derivation and branded ids.
- `audit-log`: the per-run JSONL audit log and the redaction of secret-like values.
- `run-state`: the ordered review stages and the legal transitions between them.
- `review-configuration`: the checked-in default config files for models, prices and review options.
- `cli`: the command-line entry, which for now only prints usage.

### Modified Capabilities

None. The project has no specs yet.

## Impact

- `package.json` and `bun.lock` change in this change and are frozen afterwards. Thirteen new dependencies are added, all pinned.
- `tsconfig.json` gains the `@/*` alias and possibly project references. `index.ts` is replaced.
- New files at the root: `biome.json`, `.dependency-cruiser.cjs`, `lefthook.yml`, `AGENTS.md`, `.github/workflows/ci.yml`, `.worktreeinclude`, and the `src/`, `scripts/`, `config/`, `docs/`, `prompts/`, `benchmark/` trees.
- `.gitignore` gains `runs/` and nothing for `cache/`, because caches live outside the repository under the directory `resolveCacheDirectory()` returns. `README.md` is rewritten as a skeleton and is frozen afterwards next to `package.json` and `src/shared/**`. `openspec/config.yaml` gains project context, the never-abbreviate naming rule, the cache directory rule and task rules that shape every later change.
- `src/shared` gains `cache-directory.ts` next to the contracts, so every module that caches resolves its directory through `resolveCacheDirectory()` and never writes under the repository. Every pull request name in code, docs and artifacts is spelled out: `PullRequestSource`, `pull-request-source`, `resolving-pull-request`.
- Committing becomes gated: the lefthook pre-commit runs the five checks, so a commit with a boundary violation, a missing file header, a type error, a lint error or a failing test is rejected locally and again in CI.
- No runtime behavior for end users yet: the CLI only prints usage. Every detector, the pipeline, the benchmark, the harness and the server are empty modules with an `AGENTS.md`, to be filled by later changes.
