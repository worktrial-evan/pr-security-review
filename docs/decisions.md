# Decisions

A dated log of the decisions that shape this repository, newest at the bottom. Each entry says what was decided, why, and what was observed when the decision rested on an experiment. The design documents under `openspec/` hold the full reasoning at the time of each change; this file is the short record that outlives them.

## 2026-10-15: Pin TypeScript 5.9 instead of the 7.0 native build

`typescript` is pinned to `5.9.3` in `devDependencies` and no longer appears as a `peerDependencies` entry on `7.0.x`.

dependency-cruiser, which runs the module boundary check, imports `typescript` at runtime to parse `.ts` files through the JavaScript compiler API. TypeScript 7.0.2 ships only the native `tsc` binary: it has no `main` entry and no `lib/typescript.js`, so the parse would fail and the boundary check would see no imports at all. The alternatives were a ts-morph based walker (loses the matrix-as-config) or `@swc/core` as a second parser (a native dependency outside the brief). The 5.9 pin keeps dependency-cruiser and the brief intact.

What the pin does and does not affect:

- `bunx tsc`, `bunx depcruise` and editor tooling use the pinned 5.9.3 package.
- `bun check` (Bun 1.4.3) is Bun's own type checker. It does not load the installed `typescript` package, it reports TypeScript's error codes, and it checked the whole tree in about 30 milliseconds (`✓ No type errors in 31 files [29.33ms]`). The Bun documentation states the `typescript` package is not needed for it, so the pin neither slows `bun check` down nor is required by it.

## 2026-10-15: TypeScript project references are kept, `bun check` enforces module boundaries

The experiment from design D7 of `add-foundation` was run and passed, so the repository keeps one composite TypeScript project per `src/` module. The boundary check (`bun run check:boundaries`) stays the primary enforcement of the allowed-imports matrix; the references are a second net that makes `bun check` fail on the same violation.

### The experiment

Layout tried first: a `tsconfig.json` in every `src/<module>/` with `composite: true`, a full copy of the root compiler options, `emitDeclarationOnly: true` with an `outDirectory` outside the repository, `include: ["./**/*.ts"]` and `references` to the modules the matrix grants, plus a root `tsconfig.json` with `files: []` and references to all nineteen modules. `noEmit` had to go from the module configs because a referenced composite project may not disable emit (see below), and `allowImportingTsExtensions` is allowed next to `emitDeclarationOnly`, so it stayed.

Clean tree (`<repository>` stands for the absolute repository path in every output below):

```
$ bun check
note: tsconfig.json has no files of its own. Checked the projects it references, like tsc -b.
✓ No type errors in 25 files across 3 projects [57.80ms]
exit 0
```

Violating tree, with `src/llm/probe-target.ts` exporting a constant and `src/audit/probe.ts` importing it through `@/llm/probe-target` (the matrix grants `audit` only `shared`):

```
$ bun check
src/audit/probe.ts(3,34): error TS6059: File '<repository>/src/llm/probe-target.ts' is not under 'rootDir' '<repository>/src/audit'. 'rootDir' is expected to contain all source files.
src/audit/probe.ts(3,34): error TS6307: File '<repository>/src/llm/probe-target.ts' is not listed within the file list of project '<repository>/src/audit/tsconfig.json'. Projects must list all files or use an 'include' pattern.
note: tsconfig.json has no files of its own. Checked the projects it references, like tsc -b.
Found 2 errors in 1 file, checked 28 files across 4 projects [61.19ms]
exit 1
```

`bun check -b` printed the same errors, and `bunx tsc -b` (TypeScript 5.9.3) printed the same two errors with exit 2. The D7 criterion, a clean tree that passes and a violating tree that fails with an error naming the cross-module import, was met, and both probe files were deleted afterwards.

### Three adjustments the kept layout needed

1. **The root keeps its compiler options.** A root `tsconfig.json` holding only `files: []` and `references` has no `paths`, and `.dependency-cruiser.cjs` reads the `@/` alias from that file. On the violating tree the boundary check then reported `0 violations` because the alias import came back as `couldNotResolve: true`, which dependency-cruiser counts as valid. The root therefore keeps every compiler option of the former single project, and each module project uses `"extends": "../../tsconfig.json"` so there is one copy of the options, the alias and the `test/fixtures` exclude.
2. **A twentieth project for the files outside `src`.** With `files: []` in the root, `index.ts`, `index.test.ts` and `scripts/*.ts` were no longer checked (25 files instead of 31). A root that lists those files itself does not help: with its own files present, plain `bun check` checks only the root project and ignores the references (`✓ No type errors in 6 files`). So `tsconfig.root-files.json` is a composite project for those files and the root references it as well.
3. **`noEmit` is off and declarations go to a gitignored cache.** A module config that inherits `noEmit: true` fails in both checkers: `error TS6310: Referenced project '<repository>/src/shared' may not disable emit.` Each project sets `noEmit: false`, `emitDeclarationOnly: true` and `outDirectory: node_modules/.cache/typescript/<name>`. `bun check` never writes anything; `bunx tsc -b` writes `.d.ts` and `.tsbuildinfo` files into that cache and nowhere else.

### Observed behavior of the kept layout

```
$ bun check
note: tsconfig.json has no files of its own. Checked the projects it references, like tsc -b.
✓ No type errors in 31 files across 4 projects [102.79ms]
exit 0
```

`bun check --listFiles` lists the same 31 repository files as the former single project and no file under `test/fixtures`. `bun check src/audit/jsonl-audit-sink.ts` checks that file through its module project (`✓ No type errors in 2 files`). With the two probe files back in place the kept layout fails the same way as the experiment (`Found 2 errors in 1 file, checked 34 files across 5 projects`, exit 1). The four projects with files are `shared`, `audit`, `run-state` and the root files; the fifteen empty modules each have a project that checks nothing yet.

### What this means for later changes

- A module's `tsconfig.json` lists its row of the matrix as `references`. When the matrix in `.dependency-cruiser.cjs` changes, the module's references change with it, and a drift between the two shows up as a `bun check` error on an import the boundary check allows, or the reverse.
- The references do not replace the boundary check: a module can edit its own `tsconfig.json`, while `.dependency-cruiser.cjs` is a frozen file. The boundary check remains the rule, `bun check` is the second net.
- `bun check` only follows the references because the root has no files of its own. Adding `include` or `files` to the root would silently turn the references off.

## 2026-10-15: The CLI usage stub stays in the root `index.ts`, `src/cli` stays empty

The root `index.ts` is the `module` entry in `package.json` and holds the commander program that prints usage, reports `unknown command '<name>'` and exits non-zero on an unknown command. It is outside the allowed-imports matrix and imports nothing from `src/`. `src/cli` holds only its `AGENTS.md` for now.

Putting the stub in `src/cli/main.ts` would have made `cli` the only module with code but no tests in `add-foundation`, whose brief lists only `shared`, `audit` and `run-state` as modules with code. Later changes move the real commands into `src/cli` and reduce `index.ts` to a one-line import.

## 2026-10-15: `test/fixtures` is excluded from the root `tsconfig.json`

The root `tsconfig.json` excludes `node_modules` and `test/fixtures`. The fixture trees under `test/fixtures/` exist to make the boundary check and the header check fail on purpose: they hold an import of `@/llm/thing` that resolves nowhere in the real tree, a relative import across modules and barrel `index.ts` files. Without the exclude, `bun check` would report those deliberate errors as errors of the repository.

The boundary fixtures carry their own small `tsconfig.json` with the `@/*` alias pointing at the fixture's `src/`, and `scripts/check-boundaries.ts` reads `<root>/tsconfig.json` for whichever root it is pointed at, so alias resolution follows the fixture rather than the repository. With the project references kept, every project extends the root and inherits the exclude, and no project's `include` pattern reaches `test/` in the first place; `bun check --listFiles` confirms no fixture file is loaded.

## 2026-10-15: Caches live outside the repository

Every cache (the advisory snapshot, LLM responses, cloned benchmark repositories) is written under the directory `resolveCacheDirectory()` in `src/shared/cache-directory.ts` returns: `PULL_REQUEST_REVIEW_CACHE_DIR` when the variable is set and non-empty, else `~/.cache/pull-request-review`. Locally the variable points at the gitignored `cache/` folder of the main checkout, as the next entry says. Design D16 of `add-foundation` had kept `cache/` out of the tree and out of `.gitignore`.

Later changes are built in parallel worktrees. A gitignored `cache/` inside the tree would be fetched once per worktree and thrown away with it, and a worktree created from a clean branch would start cold every time. One directory under the home folder is shared by every worktree on the machine. The environment variable exists for CI and tests, which point it at a temporary directory so a run never reads or writes the developer's cache. The function creates nothing; the module that owns a cache creates its own subdirectory. It lives in `src/shared` because the three caching modules (`advisories`, `llm`, `benchmark`) may import `shared` and nothing else in common.

Next to it, `.worktreeinclude` at the repository root lists `.env` and `.env.local`, so the desktop app copies those gitignored files into every worktree it creates and a review run in a fresh worktree has its credentials (design D17).

## 2026-10-15: The shared cache is the gitignored `cache/` folder of the main checkout

`.gitignore` lists `cache/`, and `.env.example` documents `PULL_REQUEST_REVIEW_CACHE_DIR` as the absolute path of that folder in the main checkout, such as `/Users/<you>/Projects/pr-review/cache`. `resolveCacheDirectory()` is unchanged: it returns the variable when set and non-empty, else `~/.cache/pull-request-review`. Tests and CI still point the variable at a temporary directory. This supersedes the rule of the entry above that no `cache/` directory may exist in the tree or in `.gitignore`.

The desktop app copies `.env` into every worktree under `.claude/worktrees`, so every worktree reads the same absolute path and the machine has one cache folder instead of one per worktree. One folder per worktree would fetch the advisory snapshot and clone the benchmark repositories again for every change and throw them away with it. Keeping that one folder beside the checkout instead of under the home directory makes it visible next to the project it serves, and the ignore entry keeps a run from ever committing it.

## 2026-10-15: Pull request is never abbreviated in a name

Every name spells out pull request: `PullRequest` in types, `pullRequest` in values, `pull-request` in file and module names, and "pull request" in prose. The source module, its interface and reference types, the introduced-by flag on a finding and the first run stage all carried the two-letter abbreviation and now read `src/pull-request-source`, `PullRequestSource`, `PullRequestReference`, `isIntroducedByPullRequest` and `resolving-pull-request`, with the matrix, the module docs, the README diagrams and the `add-foundation` artifacts renamed to match.

The code-style skill already bans abbreviations in variable names, and this was the one abbreviation the brief had introduced. Spelling it out once, before any module fills in, means no later change has to decide between the two spellings and no grep for the concept splits. The repository name `pr-security-review` is the one exception and is never renamed. The rule is stated in the `openspec/config.yaml` context and the root `AGENTS.md`, and the CVSS vector component `PR:H` in a sample advisory stays because there `PR` means Privileges Required.

## 2026-10-15: The CLI moves into `src/cli` and `index.ts` only runs it

`add-pipeline-and-cli` replaces the usage stub. The commander program and every command live in `src/cli`, and the root `index.ts` passes the process arguments, the real handlers and a sanitizing output to `runCli` and sets the exit code. The program takes its handlers as a parameter, so the argument parsing tests record the parsed options without cloning anything, and `tsconfig.root-files.json` references `src/cli` so `bun check` follows the entry into it. This supersedes the entry above that kept `src/cli` empty.

## 2026-10-15: Eleven pipeline steps run under ten run-state stages

The pipeline has eleven steps and the run-state contract has ten stages. Loading advisories runs under `matching` beside the match itself, dedupe runs under `summarizing` before the summaries, and assembling the result runs under `rendering`. Adding stages would have been a second edit to `src/shared` in one change. Each step writes its own step-start and step-end events and its own entry in `stepDurations`, so the audit log and the metadata still separate every step.

## 2026-10-15: An aborted review returns a result instead of throwing

When describing the pull request or collecting its files fails, `runReview` moves the run to failed and returns a `ReviewResult` with one fatal `StepError` and no findings. The contract already has `isFatal`, the report and the JSON can show what happened, and the audit log ends with a `run aborted` note. The CLI exits 2 on it. The benchmark's per-case pipeline throws on it instead, so the runner records the case as failed.

## 2026-10-15: `advisoryCacheDirectory` is the cache root

`ReviewOptions.advisoryCacheDirectory` names the directory that holds `advisories/npm/`, the directory `loadAdvisoryStore` takes, and the CLI sets it to `resolveCacheDirectory()`. The benchmark runner's default pointed at `benchmark/fixtures/advisories`, one level too deep for the store, so it now points at `benchmark/fixtures` and reads its snapshot date from `advisories/npm/snapshot.json`.

## 2026-10-15: The benchmark matches against the corpus advisories, built into a cache per run

The corpus labels are checked against `benchmark/fixtures/advisories/advisories.json`, 35 advisories that include synthetic `PRR-TEST` entries. The advisory store loads the cache layout, and the committed layout under `benchmark/fixtures/advisories/npm/` is the advisories module's 18-package subset of the real export, which lacks nine of those advisories. `bun index.ts benchmark run` indexes `advisories.json` with the advisories module's own `indexAdvisoriesByPackage` and `writeAdvisoryCache` into a temporary directory and points the run at it. The subset stays as it is because `validate-matcher` and its accepted disagreements are built on it. A committed second copy in the cache layout would drift from `advisories.json`.

## 2026-10-15: A dependency finding is introduced only when its advisory did not already affect the base

The matcher marks a finding introduced when the pull request adds or changes the version. `docs/benchmark.md` defines an introduced dependency finding as one whose head version is in the advisory's range while the base version is not, decided at the alias level. The pipeline's matching step also matches the base lockfile and sets a head finding to pre-existing when the base had the same advisory id or one of its aliases for the same installed package. That leaves the merged matcher unchanged. Without it, `dependency-09-imported-through-subpath` reported two advisories that already affected lodash at base as introduced.

## 2026-10-15: Anthropic requests send no temperature

Current Claude models, Sonnet 5.5 and Haiku 5.5 among them, return a 400 for a non-default temperature. The llm provider sends temperature 0 only to fireworks models and leaves anthropic models on their default. A rerun is reproduced by the response cache, whose key holds the prompt, the model and the output schema. A run with `--no-cache` can differ from the run before it, and the variance runs measure by how much.

## 2026-10-15: A signal cancels a run through an awaitable cancellation, not only an AbortSignal

On SIGINT or SIGTERM the CLI awaits `cancel(signal)` on a `RunCancellation` it handed to `runReview`. The pipeline answers by moving the run state to failed with `cancelled by <signal>`, writing one note with `status: cancelled`, the signal and the stage reached, and closing its own audit sink so nothing lands after the note. Only then does the CLI dispose the audit log and the pull request source and exit with 128 plus the signal number. An `AbortSignal` alone would give the CLI no way to wait for the note to reach disk before exiting. A log that ends without a `run finished`, `run aborted` or `run cancelled` note means the process was killed outright.

## 2026-10-15: `--out` names the run directory

`review --out <directory>` writes `report.html` and `audit.jsonl` directly into that directory, and the default is `runs/<runId>`, as the brief reads. The JSONL audit sink takes a run directory beside its runs directory and run id for this. The benchmark keeps `runs/<runId>` per case.

## 2026-10-15: The reviewer stops on a predicate instead of being called per file

When the cost limit stops code review, the findings of the chunks already paid for are kept and the files not reviewed are listed under the degraded steps. `reviewCode` takes `isStopError` and reports `unreviewedFiles`, so the stop happens inside the chunk loop. Calling the reviewer once per file from the pipeline would have changed how files pack into chunks, and with it every prompt and every response cache key.

## 2026-10-15: An error that escapes a command exits 2

`runCli` prints an error a handler lets through as one sanitized line and returns 2, the status the brief gives a run that could not finish. Before, a model id without a provider prefix ended in a stack trace and status 1.

