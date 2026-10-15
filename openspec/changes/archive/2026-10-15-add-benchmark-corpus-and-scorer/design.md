# Design

## Context

The shared benchmark contract (`BenchmarkCase`, `ExpectedFinding`, `BenchmarkScore`), the finding contract and the `ReviewPipeline` type exist and are frozen. The `pull-request-source`, `report`, `pipeline` and `advisories` modules hold no code at this change's base. The benchmark module may import `shared`, `pipeline`, `report` and `pull-request-source`; it imports only `shared` here. Network and `git` are available when the corpus is authored, and may be absent when it runs. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- A corpus and scorer that work with any `ReviewPipeline`, including a stub, so the benchmark is testable before the pipeline exists.
- Every rule a score depends on is mechanical, tested and written down.
- A run leaves two JSON files and two HTML pages that a later run can be compared against.

**Non-Goals:**

- Fetching advisories, parsing lockfiles or reviewing code. The runner only hands the pipeline a source and options.
- A general-purpose pull request source. The two sources here serve the corpus and are replaced when `pull-request-source` lands.

## Decisions

### D1. Module layout

`src/benchmark/` holds `cases.ts` (load the corpus), `corpus-validation.ts` (validate it against every check in the corpus spec), `fixtures.ts` (read the advisory fixture and check the fixture app), `match-rules.ts` (the rules that match a prediction to a label), `score.ts` (the pure scorer over those rules), `unified-diff.ts` (parse `git diff` output into `ChangedFile` values), `snapshot-pull-request-source.ts`, `git-pull-request-source.ts`, `case-source.ts` (open the source of one case), `run.ts` (the runner), `run-results.ts` (the results file schema), `results-page.ts` (the HTML page), `error-messages.ts` (one-line messages from thrown values and zod errors), `validate.ts` (the `benchmark:validate` entry) and one `.test.ts` beside each. Three files hold only test support and have no test of their own: `temporary-corpus.ts` builds the corpora the loader, validator and command tests read, `stub-pipeline.ts` is the stub pipeline the runner tests drive, and `test-environment.ts` saves and restores environment variables. A file is split when it passes about 400 lines, so the loader and the validator, and the rules and the scorer, are separate files. Every file imports `shared` only, so the module's boundary row stays unused beyond `shared`.

### D2. Both sources diff through git

The snapshot source runs `git diff --no-index --unified=0 base head` and the git source runs `git -C <clone> diff --unified=0 baseSha headSha`, and one parser in `unified-diff.ts` turns either output into `ChangedFile` values with hunks, added lines with head line numbers, the renamed and binary flags and the status. A hand-written tree diff would duplicate what git already does. `readFileAtBase` and `readFileAtHead` read the file from the directory or from `git show <sha>:<path>`, returning null when git exits non-zero. `checkoutHead` returns the `head/` directory for a snapshot and a detached `git worktree` under a temporary directory for a git case, which `dispose` removes. Alternative rejected: a line-diff library, because git is already a requirement of the real-world cases.

### D3. Clone cache

A git case clones once into `<resolveCacheDirectory()>/benchmark-repos/<host>/<owner>/<repo>` with `git clone --no-checkout` and reuses that directory when it exists. A clone failure whose stderr names resolution or connection problems, or any failure when `PULL_REQUEST_REVIEW_OFFLINE` is set, marks the case skipped with a warning on stderr. A failure of another kind is reported as that case's error.

### D4. Advisory fixture

`benchmark/fixtures/advisories/advisories.json` is an array in the shared `Advisory` shape and `snapshot.json` is an `AdvisorySnapshot` whose `sha256` is the digest of `advisories.json`. Real entries are fetched from the OSV API by id while the corpus is authored and kept verbatim in the subset the contract holds. Synthetic entries use ids `PRR-TEST-<n>`, affect only fixture app packages, and exist for the four matcher edges the dependency cases need. `benchmark/fixtures/advisories/known-clean.json` lists fixture packages that have no advisory at all, so the coverage check in the validator has an answer for every package. The runner passes the fixture directory as `advisoryCacheDir` with `isOffline` true. The advisories module decides its own cache format when it lands.

### D5. Fixture app and its lockfiles

The app is `benchmark/fixtures/app/src/*.ts` on `Bun.serve` with `bun:sqlite`, one `package.json` with direct dependencies `lodash`, `jsonwebtoken`, `minimist`, `mustache` and `ms`, and `semver` as a dev dependency. `bun.lock` comes from `bun install --lockfile-only` in that directory. `package-lock.json` (lockfile version 3) is written by a throwaway script from the registry metadata of the same versions and is not checked in as a script. No `node_modules` is committed. The tree is small on purpose so each of the 46 snapshot cases can carry full copies.

### D6. Case derivation

Each synthetic case copies the fixture app into `base/` and applies its one change to `head/`. A case that needs a different base (the refactor-moves-vulnerable-code clean case, the pre-existing cases) edits `base/` too and says so in its description. Dependency cases edit `package.json` and the lockfiles by hand, fetching the integrity of a version the base tree does not hold from the registry. Every case directory name is `<category>-<nn>-<slug>` so a listing sorts by category.

### D7. Scorer shape

`scoreBenchmark({ caseOutcomes })` takes one outcome per case (`benchmarkCase`, `findings`, `costUsd`, `durationMs`, `status`) and returns a `BenchmarkScore` from the shared contract plus `caseDetails` with the matched pairs, unmatched predictions, pre-existing findings and per-case cost and duration. Matching is greedy and one-to-one: expected findings in label order, each taking the first unmatched prediction that satisfies its rule. A skipped or failed case contributes its expected findings as false negatives only when failed; a skipped case is left out of every count.

### D8. Runner outputs

`runBenchmark({ pipeline, split, label, options })` returns the results object it writes. `options` holds `casesDir`, `resultsDir`, `reviewOptions` overrides, `auditSink` and `now`, each with a default, so the test points everything at temporary directories. The timestamp is `now` in basic ISO form, `20261015T201500Z`, and the files are `<timestamp>-<label>.json`, `<timestamp>-<label>.html`, `latest-<split>.json` and `latest-<split>.html`. The git sha is `git rev-parse HEAD` of the repository. Prompt versions and model ids are the union of every result's `metadata` records, the advisory snapshot date is `fetchedAt` from the fixture, and the cache flag is the `isCacheEnabled` the run used. The audit sink defaults to one that discards events.

### D9. Results page

`results-page.ts` renders the page with template strings: a metrics table, a breakdown table and a per-case table with `data-` attributes and a short inline script that hides rows not matching the selected category, split and status. The `report` module is empty at this base, so nothing is imported from it.

### D10. Validation entry and nested biome config

`validate.ts` runs every check in `corpus-validation.ts`, prints the counts by category and split and exits non-zero naming each failing case. The validator diffs every snapshot case through the same `git diff --no-index` the runner uses and requires each label's line range to lie within the lines the head adds, and it looks every labeled advisory id up in the advisory fixture. `benchmark/biome.json` extends the root with `"root": false`, turns the linter off and leaves the formatter on, the same way `test/fixtures/headers/biome.json` does.

## Risks / Trade-offs

- [Two diff parsers once `pull-request-source` lands] → the benchmark's sources are swapped for that module's in a follow-up change, and the parser here is tested against the shared contract so the swap is a one-file change.
- [Hand-edited lockfiles that do not resolve] → the validator checks that both lockfiles name the same packages and versions, and the fixture app installs clean from its `package.json`.
- [Real-world shas drift if a repository rewrites history] → the case records the clone url and both shas, and the runner reports a missing sha as that case's error instead of failing the run.
- [Formatter rewrites a vulnerable fixture line] → the formatter only moves whitespace and quotes, and every label is checked against the formatted head.
