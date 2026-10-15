# Design

## Context

See proposal.md for motivation. The repo today is the `bun init` output plus OpenSpec and three agent skills: a hello-world `index.ts`, a strict `tsconfig.json` (`verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`, `noUncheckedIndexedAccess`), `typescript@7.0.2` as a peer dependency, `@types/bun@latest`, and no `src/`. Bun 1.4.3 is the runtime and `bun check` is the type check.

Constraints that shape the approach:

- `CLAUDE.md` mandates Bun for everything: `bun test`, `bun check`, `bunx`, `Bun.file`, no `node` or `npm` tooling.
- The `code-style` skill applies to every `.ts` file written here: comment groups, top-down order, named intermediates, no abbreviations, boolean prefixes, explicit return types, object parameters, discriminated unions, branded types, `@/` alias imports without `.ts` extensions.
- The `git-discipline` skill forbids pushing and requires commit approval, so every task here ends at a staged, verified tree.
- `typescript@7.0.2` ships only the native `tsc` binary and no JavaScript compiler API. dependency-cruiser parses `.ts` through that API. The user chose to pin TypeScript 5.9 to keep dependency-cruiser, so `bun check` runs the JavaScript `tsc` from now on.
- Later changes run in parallel worktrees, so everything they would all touch must land here and then stay frozen.

## Goals / Non-Goals

**Goals:**

- One source of truth for the allowed-imports matrix (`.dependency-cruiser.cjs`), read by the boundary check, mirrored in the root `AGENTS.md` and the README diagram.
- Every check reachable by one command, `bun run verify`, and that command is what the hook and CI run.
- Every check testable against a fixture, so a broken check is caught by `bun test` rather than by silently passing.
- Contracts that are complete enough that a detector change needs no new shared field.
- An empty module is a real module: it has a directory and an `AGENTS.md`, so a later change only fills it in.

**Non-Goals:**

- No detector, pipeline, report, benchmark, harness or server logic. Those modules get an `AGENTS.md` and nothing else.
- No generated module graph. The README diagrams are drawn by hand from the matrix in this change.
- No prompt files, benchmark cases or docs beyond `docs/decisions.md` and the AGENTS template. The directories exist with a `.gitkeep`.
- No release or packaging. `index.ts` runs under `bun`, nothing is bundled.

## Decisions

### D1. Pin TypeScript 5.9, drop the 7.0 native build

dependency-cruiser imports `typescript` at runtime to parse `.ts`; TypeScript 7.0.2 has no `main` and no `lib/typescript.js`, so the parse would fail and the boundary check would see no imports. Options were to pin 5.9 (chosen, keeps the brief intact), to replace dependency-cruiser with a ts-morph walker (deviates from the brief and loses the matrix-as-config), or to add `@swc/core` as a second parser (a native dependency not on the list). `typescript` moves to `devDependencies` pinned exact; the `peerDependencies` entry goes away. `bun check` shells to the installed `tsc`, so it keeps working, only slower. Recorded in `docs/decisions.md`.

### D2. Exact pins for everything, set with `bun add --exact`

All thirteen new packages plus `@types/bun`, `typescript` and `@fission-ai/openspec` are pinned to exact versions (no `^`). Then `package.json` and `bun.lock` join the frozen files list, and `bun install --frozen-lockfile` in CI guarantees the lock matches. Alternative was keeping carets and relying on the lockfile alone; rejected because a caret invites a later change to "just bump" and touch the frozen file.

### D3. The matrix lives in `.dependency-cruiser.cjs` as a table, rules are generated from it

The config file holds a plain object `allowedImports: { audit: ['shared'], ... }` and a loop that turns each entry into a dependency-cruiser `forbidden` rule: `from: { path: '^src/<module>/' }, to: { path: '^src/', pathNot: '^src/(<module>|<allowed...>)/' }`. A reader sees the matrix as a table, not as nineteen regexes. Two extra rules: `no-barrel-files` forbids any `^src/[^/]+/index\.ts$` (stricter than "only re-exports", simpler to check, and the code-style skill already bans barrels), and `no-orphans` stays off because empty modules would trip it. `options.tsConfig.fileName` points at `tsconfig.json` so the `@/` alias resolves through the bundled `tsconfig-paths-webpack-plugin`, and `tsPreCompilationDeps: true` so type-only imports count. Tests inside a module import that module and nothing else, so they need no special rule.

### D4. `check:boundaries` and `check:headers` are scripts that take a root argument

`scripts/check-boundaries.ts` calls dependency-cruiser's `cruise()` API with the repo config and `baseDir` set to an optional root argument (default: the repo). `scripts/check-file-headers.ts` takes root directories as arguments (default: `src scripts benchmark`). A root argument is what lets a test point either check at a fixture under `test/fixtures/` without the fixture tripping the real check: `test/` is outside the header roots and outside `src/`. The boundary fixture is a mini tree `test/fixtures/boundaries/src/{shared,audit}/` where `shared/bad.ts` imports `../audit/thing`; the test runs the check with that root and expects a non-zero result naming `bad.ts`. The header fixture is `test/fixtures/headers/headerless.ts` whose first line is an import. Both scripts print violations to stderr and `process.exit(1)`, and export a function the tests call directly so the test does not spawn a process. The root `tsconfig.json` excludes `test/fixtures` so a fixture's deliberately unresolvable `@/llm/thing` import never reaches `bun check`; the boundary fixture carries its own small `tsconfig.json` with the `@/*` alias pointing at the fixture's `src/`, and the boundary script reads `<root>/tsconfig.json` so alias resolution follows whichever root it is pointed at.

### D5. `bun run verify` is the one chain, lefthook calls it

`package.json` scripts: `check:boundaries`, `check:headers`, and `verify` = `bun check && biome check && bun run check:boundaries && bun run check:headers && bun test`. `lefthook.yml` has one pre-commit command running `bun run verify`, which is the same five in the same order and cannot drift from the script. Alternative was listing the five as separate lefthook commands; rejected as a second copy of the chain. Hooks are installed by a `prepare` script (`lefthook install`), which Bun runs for the root package on `bun install`; the lefthook package's own postinstall is blocked by Bun's untrusted-dependency rule, so `prepare` is the reliable path.

### D6. Biome: `asNeeded` semicolons, single quotes, organize imports on, comments allowed in `config/*.json`

`biome.json` sets `formatter.indentStyle: space`, `javascript.formatter.semicolons: 'asNeeded'`, `quoteStyle: 'single'`, `assist.actions.source.organizeImports: 'on'`, recommended lint rules, and `useImportType` so `verbatimModuleSyntax` stays happy. An override for `config/**/*.json` turns on `json.parser.allowComments` because `config/models.json` carries the "fill these in" comment. `tsconfig.json` is already treated as JSONC by Biome. `biome check` runs formatter, linter and import sorting in one pass and is the second step of `verify`.

### D7. Project references: run the experiment, keep only on a positive result

Attempt: a `tsconfig.json` per module with `composite: true` and `references` to the module's allowed imports, and the root `tsconfig.json` with `files: []` and `references` to all nineteen. The pass criterion is a deliberate `src/audit` → `src/llm` import that `bun check` reports as an error while a clean tree still passes. Two known obstacles make a negative result likely: `bun check` runs `tsc --noEmit` on the root project rather than `tsc -b`, so references may be ignored, and `composite` requires declaration emit, which conflicts with `allowImportingTsExtensions` under `noEmit`. On a negative result the per-module tsconfigs are deleted, the root stays a single project, and `docs/decisions.md` records the exact failure. Either way the boundary check remains the enforcement; references were only ever a second net.

### D8. `index.ts` stays the entry and holds the usage stub; `src/cli` stays empty

The root `index.ts` is the `module` entry in `package.json` and is outside the matrix, so it may import nothing from `src/` yet. It builds a commander program named `pr-review` with a description, `showHelpAfterError`, an optional `[command]` argument, and an action that prints help and exits 0 when no command was given or prints `unknown command '<name>'` to stderr plus help and exits 1 otherwise. Later changes move the real commands into `src/cli` and make `index.ts` a one-line import. Alternative was putting the stub in `src/cli/main.ts` now; rejected because then `cli` would be the only module with code but no tests, and the brief lists only shared, audit and run-state as code in this change.

### D9. Contracts: zod schema plus inferred type per concept, TS-only where a value holds a function

Each `src/shared/<concept>.ts` exports `<name>Schema` and `type <Name> = z.infer<typeof <name>Schema>`. Enumerations are `z.enum` over a `const` tuple exported beside them (`severities`, `detectorKinds`, `runStages`) so other modules iterate them. Variants are `z.discriminatedUnion` on the kind field (`detector` for findings, `stage` for run states, `kind` for benchmark sources). Branded ids are `z.string().brand<'FindingId'>()`. `Map` and `Set` fields use `z.map` and `z.set`. Interfaces whose members are functions (`PullRequestSource`, `DependencyGraph`, `AdvisoryStore`, `AuditSink`, `LlmClient`) and types that hold a schema (`LlmGenerateOptions.schema`) or a function (`ReviewPipeline`) are plain TypeScript types in the same file and are not round-trip tested. `createFindingId({ detector, stableKey })` lives in `finding.ts`, hashes `${detector}\n${stableKey}` with `Bun.CryptoHasher('sha256')` and returns the first 16 hex characters branded as `FindingId`. Field names follow the code-style rules (`isIntroducedByPullRequest`, `isGithubReviewed`, `dependencyScope`) and every field in the brief is present.

### D10. Audit sink appends with `node:fs` and fsyncs per write

`JsonlAuditSink` takes `{ runId, runsDir = 'runs' }`, opens `runs/<runId>/audit.jsonl` once with `openSync(path, 'a')` after `mkdirSync(dir, { recursive: true })`, and on `write` redacts the event, `writeSync`s one JSON line and `fsyncSync`s. `Bun.file(path).writer()` has no append mode and would truncate an existing log, so this is the one place `node:fs` is used over `Bun.file`. `dispose()` closes the descriptor. `redact(payload)` in `src/audit/redact.ts` returns a deep copy where any string that matches a token shape (`ghp_`, `github_pat_`, `sk-ant-`, `sk-`, `AKIA`, `Bearer …`, `xox[bpa]-`) or sits under a key matching `/token|secret|password|passwd|api[-_]?key|authorization|credential/i` becomes `sha256:<first 16 hex>`, the same width as a finding id. Numbers, booleans, paths and ordinary strings pass through.

### D11. Run state derives stage start from completed durations and takes an injectable clock

`createRunState({ runId, now })` and `advanceRunState({ state, to, error, now })` take `now` (a `Date`, default `new Date()`) so tests control durations. The stage being left started at `startedAt + sum(completed durations)`, so no extra timestamp field is stored and the contract stays exactly what the brief lists. A legal advance is `to === runStages[indexOf(state.stage) + 1]` or `to === 'failed'` with an error from any non-terminal stage; everything else throws `IllegalTransitionError extends Error` with `from` and `to` fields. The function returns a new state and never mutates its input.

### D12. Frozen files and what "frozen" means

After this change these files are edited only by a change whose proposal names them in its Impact section, never by a module change: `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `.dependency-cruiser.cjs`, `lefthook.yml`, `.github/workflows/ci.yml`, `openspec/config.yaml`, `src/shared/**`, `docs/agents-template.md`, `README.md`. The list goes into the `openspec/config.yaml` context so every later proposal sees it, and into the root `AGENTS.md`. `README.md` is on the list because its module graph and sequence diagram describe the whole system, so two module changes editing it in parallel worktrees would conflict on merge.

### D15. One commit per change, after archive

A change is built without any commit: files are staged as they are finished, the user archives the change when they consider it finished, and then one commit holds the implementation, the planning artifacts and the archived change together. The `openspec/config.yaml` context states this so every later change follows it, next to the never-push rule from the `git-discipline` skill.

### D13. Documentation layout

`docs/agents-template.md` is the per-module AGENTS template with the eight sections (Purpose, Public API, Inputs and outputs, Allowed imports, Files, Invariants, How to test, Known gaps). Every `src/<module>/AGENTS.md` is that template filled in; for an empty module, Purpose is one line, Allowed imports is copied from the matrix, Files says "none yet" and Known gaps says "not implemented". The root `AGENTS.md` lists the nineteen modules one line each, points at `.dependency-cruiser.cjs` for the matrix, lists the frozen files and the five checks. `docs/decisions.md` is a dated list of decisions, starting with D1, D7's outcome and D8. `README.md` has the title, one paragraph, three Mermaid diagrams (`graph LR` module graph from the matrix, `sequenceDiagram` pull request to report, `flowchart` benchmark loop) and the seven empty headed sections.

### D14. CI pins the Bun version

`.github/workflows/ci.yml` runs on push and pull request, uses `oven-sh/setup-bun` with `bun-version: 1.4.3` to match the local runtime, then `bun install --frozen-lockfile` and `bun run verify`. A `.bun-version` file is not added; the single pin in the workflow is enough for now.

### D16. Caches live outside the repo

The advisory snapshot, LLM responses and cloned benchmark repositories are written under one directory that `resolveCacheDirectory()` in `src/shared/cache-directory.ts` returns: `PULL_REQUEST_REVIEW_CACHE_DIR` when the variable is set and non-empty, else `~/.cache/pull-request-review`. Later changes are built in parallel worktrees, and a `cache/` directory inside the tree would be fetched once per worktree and thrown away with it, so there is no `cache/` directory and `.gitignore` does not list one; every worktree shares the one directory under the home folder. The environment variable exists for CI and tests, which point it at a temporary directory so a run never reads or writes the developer's cache. The function creates nothing: the module that owns a cache creates its own subdirectory under the returned path. The function lives in `src/shared` because every caching module (advisories, llm, benchmark) may import shared and nothing else they have in common. Alternative was a gitignored `cache/` inside the repo; rejected for the worktree reason.

### D17. `.worktreeinclude` copies env files into worktrees

`.env` and `.env.local` are gitignored, so a fresh worktree has neither and a review run there has no credentials. `.worktreeinclude` at the repository root lists exactly those two files, one per line, and the desktop app copies the listed files into every worktree it creates. The file is committed; the env files it names never are. The tracked file holds only names, never values, so adding a new env file later means adding one line here.

## Risks / Trade-offs

- [`bun check` is slower on TypeScript 5.9 than on the native 7.0 build] → The tree is small; revisit when dependency-cruiser gains a parser that works without the compiler API, and record the pin in `docs/decisions.md` so the reason is visible.
- [dependency-cruiser's alias resolution misreads `@/` and a cross-module import slips through] → The boundary test fixture includes one `@/`-style import as well as one relative import, so a resolution failure fails `bun test`.
- [Project references turn out unusable and time is spent on them] → The experiment is one task with a written pass criterion and a 'drop' path; the boundary check does not depend on it.
- [`lefthook install` fails during `bun install` where there is no `.git` (a tarball, some CI caches)] → CI checks out with git, so it passes there; if a non-git install ever matters, the `prepare` script gains a guard then. Not pre-empted now.
- [Redaction patterns miss a token shape and a secret reaches `runs/`] → `runs/` is gitignored, the key-name heuristic catches the common carriers, and the `secrets` module can later export its rule set for audit to reuse through shared.
- [Round-trip tests with `Map` and `Set` fields compare by structure] → `bun:test`'s `toEqual` compares `Map` and `Set` contents, which is what the spec needs.
- [Pre-commit runs the full suite and gets slow as modules fill in] → Acceptable at this size; a later change can scope `bun test` to staged modules without changing the `verify` contract.
- [Biome's organize-imports order differs from what the user expects for `@/` vs relative imports] → Biome's default groups are accepted as the rule; the format is enforced, not negotiated, and `biome check --write` fixes a file in place.
