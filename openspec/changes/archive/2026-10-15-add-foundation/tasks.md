# Tasks

## 1. Dependencies and root tooling

- [x] 1.1 Move `typescript` from `peerDependencies` to `devDependencies` pinned to the latest 5.9.x, pin `@types/bun` and `@fission-ai/openspec` to their installed exact versions, and verify `bun check` still runs and `cat package.json` shows no `^` or `latest`
- [x] 1.2 Install the thirteen dependencies with `bun add --exact` (runtime: zod, semver, jsonc-parser, fflate, commander, ai, @ai-sdk/anthropic, @ai-sdk/fireworks, ts-morph; dev: @types/semver, @biomejs/biome, dependency-cruiser, lefthook) and verify `bun install --frozen-lockfile` exits 0 on the result
- [x] 1.3 Add the `@/*` → `src/*` path alias to `tsconfig.json` without changing any existing option, and verify `bun check` passes on a throwaway file that imports through the alias
- [x] 1.4 Add `biome.json` per design D6 (asNeeded semicolons, single quotes, organize imports, useImportType, comments allowed under `config/`), and verify `bunx biome check .` passes on the current tree after `bunx biome check --write .`
- [x] 1.5 Add `package.json` scripts `check:boundaries`, `check:headers`, `verify` (the five-step chain from design D5) and `prepare` (`lefthook install`), add `lefthook.yml` with one pre-commit command running `bun run verify`, and verify `bun install` creates `.git/hooks/pre-commit` that mentions lefthook
- [x] 1.6 Add `.github/workflows/ci.yml` (push and pull_request, setup-bun 1.4.3, `bun install --frozen-lockfile`, `bun run verify`), and verify `bunx action-validator` or a careful read shows valid workflow YAML with those two steps
- [x] 1.7 Add `runs/` and `cache/` to `.gitignore`, and verify `git check-ignore runs/x cache/x` lists both

## 2. Module layout and agent docs

- [x] 2.1 Create `src/<module>/` for all nineteen modules, plus `prompts/`, `benchmark/`, `config/`, `scripts/`, `docs/` with a `.gitkeep` where the directory would otherwise be empty, and verify `ls src | wc -l` prints 19
- [x] 2.2 Write `docs/agents-template.md` with the eight sections (Purpose, Public API, Inputs and outputs, Allowed imports, Files, Invariants, How to test, Known gaps), and verify the file has exactly those eight `##` headings in that order
- [x] 2.3 Write `src/<module>/AGENTS.md` for every module from the template, with Allowed imports copied from the matrix, and verify `for m in src/*; do test -f $m/AGENTS.md; done` finds all nineteen and each lists the same allowed modules as the matrix
- [x] 2.4 Write the root `AGENTS.md` listing every module in one line, pointing at `.dependency-cruiser.cjs` for the matrix, listing the frozen files from design D12 and the five `verify` checks, and verify every module name in `src/` appears in it

## 3. Boundary check

- [x] 3.1 Write `.dependency-cruiser.cjs` with the `allowedImports` table from the brief, the generated forbidden rules, the `no-barrel-files` rule, `tsConfig.fileName` and `tsPreCompilationDeps` per design D3, and verify `bunx depcruise --validate .dependency-cruiser.cjs src` reports no violations on the empty modules
- [x] 3.2 Write `scripts/check-boundaries.ts` wrapping the `cruise()` API with an optional root argument, exporting a `checkBoundaries` function and exiting non-zero with every violation on stderr, and verify `bun run check:boundaries` exits 0 on the clean tree
- [x] 3.3 Add the fixture `test/fixtures/boundaries/` (a mini `src/` where `shared/bad.ts` imports `../audit/thing` relatively and `audit/also-bad.ts` imports `@/llm/thing` through the alias, plus a module `index.ts` barrel) and `scripts/check-boundaries.test.ts` asserting the check names all three violations and passes on a clean fixture, and verify `bun test scripts/check-boundaries.test.ts` passes
- [x] 3.4 Temporarily add a real `src/audit` → `src/llm` import, verify `bun run check:boundaries` exits non-zero naming it, then remove the import

## 4. File header check

- [x] 4.1 Write `scripts/check-file-headers.ts` (roots as arguments, default `src scripts benchmark`, `//` on line 1 or line 2 after a shebang, exported `checkFileHeaders` function, non-zero exit listing offenders), and verify `bun run check:headers` exits 0 on the tree
- [x] 4.2 Add `test/fixtures/headers/` with a headerless file, a shebang-then-header file, a block-comment-header file and a correct file, and `scripts/check-file-headers.test.ts` asserting exactly the headerless and block-comment files are reported, and verify `bun test scripts/check-file-headers.test.ts` passes

## 5. TypeScript project references experiment

- [x] 5.1 Add per-module `tsconfig.json` files with `composite` and `references` per the matrix and a root `tsconfig.json` with `files: []` and references, run `bun check` on a clean tree and again with a deliberate `src/audit` → `src/llm` import, and verify the outcome against design D7's pass criterion
- [x] 5.2 Keep the references only if 5.1 passed, otherwise delete the per-module tsconfigs and restore the single root project, then write `docs/decisions.md` with dated entries for the TypeScript 5.9 pin (D1), the references outcome with the exact `bun check` behavior observed (D7) and the `index.ts` entry decision (D8), and verify `bun check` passes on the final tree

## 6. Shared contracts

- [x] 6.1 Write `src/shared/finding.ts` (severities, detector kinds, `FindingId` brand, `findingBaseSchema`, the three variant schemas, `findingSchema` discriminated union, `createFindingId`) and `src/shared/finding.test.ts` covering round trip of one sample per variant, confidence out of range rejected, and deterministic 16-hex ids that differ by detector, and verify `bun test src/shared/finding.test.ts` passes
- [x] 6.2 Write `src/shared/pull-request-source.ts` (PullRequestReference, Hunk with line kinds, ChangedFile, `PullRequestSource` interface) and its test covering round trip and an invalid hunk line kind, and verify the test passes
- [x] 6.3 Write `src/shared/dependency.ts` (DependencyVersion, DependencySet with `z.map` and `z.set`, DependencyDiff, `DependencyGraph` interface) and its test covering a set with two versions of one package, and verify the test passes
- [x] 6.4 Write `src/shared/advisory.ts` (Advisory, AffectedPackage with range types, AdvisorySnapshot, `AdvisoryStore` interface) and its test covering round trip and an invalid range type, and verify the test passes
- [x] 6.5 Write `src/shared/audit.ts` (AuditEvent with kinds, `AuditSink` interface) and its test covering an `llm-call` event with cost, and verify the test passes
- [x] 6.6 Write `src/shared/run-state.ts` (ordered `runStages` tuple, per-stage `RunState` discriminated union with the error only on `failed`) and its test covering a failed state with error and a non-failed state rejecting one, and verify the test passes
- [x] 6.7 Write `src/shared/review.ts` (ReviewOptions, ReviewMetadata, StepError, ReviewResult, `ReviewPipeline` type) and its test round-tripping a result with one finding per detector and one step error, and verify the test passes
- [x] 6.8 Write `src/shared/llm.ts` (PromptTemplate, `LlmGenerateOptions` type holding a zod schema, LlmGenerateResult with nullable cost, `LlmClient` interface) and its test covering a null cost staying null, and verify the test passes
- [x] 6.9 Write `src/shared/benchmark.ts` (BenchmarkCase with the snapshot/git source union, ExpectedFinding, BenchmarkScore) and its test covering both sources and a mixed source rejected, and verify the test passes
- [x] 6.10 Fill `src/shared/AGENTS.md` with the real Public API (every exported schema, type and `createFindingId`), Files and Invariants (no imports from other modules, every schema has a round-trip test), and verify it lists every file in `src/shared`

## 7. Audit module

- [x] 7.1 Write `src/audit/redact.ts` with the token-shape and key-name rules from design D10 returning a deep copy, and `src/audit/redact.test.ts` covering a fake `ghp_` token under `authorization`, equal secrets giving equal fingerprints, ordinary values untouched and the input not mutated, and verify the test passes
- [x] 7.2 Write `src/audit/jsonl-audit-sink.ts` (`JsonlAuditSink` implementing `AuditSink`, `runs/<runId>/audit.jsonl`, mkdir, append with fsync per write, `dispose`) and `src/audit/jsonl-audit-sink.test.ts` writing three events into a temp `runsDir`, asserting three lines that each parse against `auditEventSchema`, the token is redacted on disk and the last line is readable right after `write` resolves, and verify the test passes
- [x] 7.3 Fill `src/audit/AGENTS.md` with the real Public API, Files, Invariants (one line per event, redact before write, fsync per write) and How to test, and verify it lists both source files

## 8. Run-state module

- [x] 8.1 Write `src/run-state/run-state.ts` with `IllegalTransitionError`, `createRunState` and `advanceRunState` per design D11, and `src/run-state/run-state.test.ts` covering create, a legal advance with a recorded duration under an injected clock, skip rejected, backwards rejected, `done` and `failed` terminal, `failed` from the middle with an error, `failed` without error rejected, and the error being an `IllegalTransitionError` with `from` and `to`, and verify the test passes
- [x] 8.2 Fill `src/run-state/AGENTS.md` with the real Public API, Invariants (forward only, failed from anywhere, input never mutated) and How to test, and verify it lists the source file

## 9. CLI entry stub

- [x] 9.1 Replace `index.ts` with the commander usage stub from design D8, and verify `bun index.ts` and `bun index.ts --help` print usage with exit 0 and `bun index.ts frobnicate` prints `unknown command 'frobnicate'` with a non-zero exit
- [x] 9.2 Add `index.test.ts` spawning the three invocations with `Bun.spawn` and asserting the exit codes and output, and verify `bun test index.test.ts` passes

## 10. Configuration files

- [x] 10.1 Write `config/models.json` (reviewModelId and summarizeModelId defaults, `prices` map with both ids at input 0 and output 0 and a comment telling the user to fill them from the provider pricing page) and `config/review.json` (contextLines 30, isLlmEnabled true, isCacheEnabled true, advisoryStaleHours 24), and verify `bun -e` with `jsonc-parser` parses both and `biome check config` passes

## 11. OpenSpec project context

- [x] 11.1 Fill `openspec/config.yaml` `context` with: Bun only per CLAUDE.md, modular monolith with the matrix in `.dependency-cruiser.cjs`, the file header rule, AGENTS.md per module from `docs/agents-template.md`, the code-style and git-discipline skills, the frozen files list from design D12, never push, merge or archive, and one commit per change made only after the user archives it; add `rules.tasks` requiring the last two tasks of every change to be "bun run verify passes" and "module AGENTS.md updated"; and verify `bunx openspec instructions tasks --change add-foundation --json` echoes the context and the two rules

## 12. README skeleton

- [x] 12.1 Rewrite `README.md` with the title, one paragraph on what the agent does, a `graph LR` Mermaid module graph drawn from the matrix, a `sequenceDiagram` from pull request to report through the run stages, a `flowchart` of the benchmark loop, and the empty headed sections How to run, Benchmark, Results, Model and cost, Audit log, Gaps and extension points, What's next, and verify every module from the matrix appears as a node in the module graph and the seven headings are present

## 13. Rename and plan additions

- [x] 13.1 Replace the two-letter abbreviation of pull request with `pullRequest` across code, the matrix, docs and artifacts, so the module is `src/pull-request-source`, the types are `PullRequestSource` and `PullRequestReference`, the finding flag is `isIntroducedByPullRequest`, the run stage is `resolving-pull-request` and prose says "pull request", and verify `grep -rn -E 'P[r]Source|P[r]Reference|p[r]Reference|p[r]Source|p[r]-source|IntroducedByP[r]|resolving-p[r]' . --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock` prints nothing (the brackets keep the command from matching its own line)
- [x] 13.2 Add `src/shared/cache-directory.ts` exporting `cacheDirectoryEnvironmentVariable` and `resolveCacheDirectory()` per design D16, with `src/shared/cache-directory.test.ts` covering the variable set, unset and empty, and verify `bun test src/shared/cache-directory.test.ts` passes
- [x] 13.3 Add `.worktreeinclude` at the root listing `.env` and `.env.local` per design D17, and verify `cat .worktreeinclude` prints exactly those two lines
- [x] 13.4 Drop `cache/` from `.gitignore` and keep `runs/`, and verify `git check-ignore cache/x` exits non-zero while `git check-ignore runs/x` still lists it
- [x] 13.5 Add `README.md` to the frozen files list and the never-abbreviate rule to `openspec/config.yaml` and the root `AGENTS.md`, and verify `grep -n 'README.md' openspec/config.yaml AGENTS.md` and `grep -n 'Never abbreviate' openspec/config.yaml AGENTS.md` each hit both files

## 14. Final verification

- [x] 14.1 Clone the repository into a temp directory, run `bun install` then `bun run verify` there, and verify both exit 0 with the pre-commit hook installed
- [x] 14.2 bun run verify passes
- [x] 14.3 module AGENTS.md updated

## Workflow follow-up

- Nothing is committed during implementation. Stage finished files as you go.
- When the user says everything is finished, archive the change on their request.
- Then make one commit holding the implementation, the planning artifacts and the archived change. The user pushes.
