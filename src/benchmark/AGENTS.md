# benchmark module

## Purpose

Loads and validates the labeled corpus under `benchmark/cases`, runs any `ReviewPipeline` over one split of it offline against the pinned advisory fixture, scores the findings against the labels by explicit matching rules, and writes the results files and page a person compares runs with.

## Public API

### cases.ts

- `benchmarkCasesDirectory`, `benchmarkAdvisoryFixtureDirectory`, `benchmarkFixtureAppDirectory`: the absolute paths of `benchmark/cases`, `benchmark/fixtures/advisories` and `benchmark/fixtures/app`, resolved from the repository root
- `benchmarkAdvisoryCacheDirectory`: the absolute path of `benchmark/fixtures`, the advisory cache root holding `advisories/npm/` that a run hands the pipeline
- `LoadedBenchmarkCase`: a `BenchmarkCase` with the `caseDirectory` it was read from
- `LoadBenchmarkCasesOptions`, `loadBenchmarkCases({ casesDirectory?, split? })`: reads every `case.json`, throws on the first one that does not parse, keeps one split when asked, and returns the cases sorted by id
- `CaseRead`, `readCaseDirectories(casesDirectory)`: one read per case directory in name order, each loaded or failed with the directory name and the message
- `resolveRepositoryRoot()`: the closest directory above this module that holds a `package.json`
- `isDirectory(path)`: whether a path names an existing directory

### corpus-validation.ts

- `ValidateBenchmarkCorpusOptions`, `validateBenchmarkCorpus({ casesDirectory?, advisoryFixtureDirectory?, fixtureAppDirectory? })`: applies every check in the corpus spec and returns a `CorpusValidation`
- `CorpusProblem`: one failed check, with the `caseId` it belongs to, or `corpus`, `advisory-fixture` or `fixture-app` for a check across cases
- `CorpusValidation`: the problems, the counts by category and the dev and test counts within each category

### fixtures.ts

- `AdvisoryFixtureRead`, `readAdvisoryFixture(advisoryFixtureDirectory)`: reads `advisories.json` against `advisorySchema` and `known-clean.json`, with one message per file that is missing or malformed
- `CheckFixtureAppOptions`, `checkFixtureApp({ fixtureAppDirectory, advisories, knownCleanPackages })`: checks that `bun.lock` and `package-lock.json` name the same `name@version` set and that every package in them has an advisory or is listed as known clean, one message per failure

### match-rules.ts

- `MatchesExpectedFindingOptions`, `matchesExpectedFinding({ expectedFinding, predictedFinding })`: applies the detector check and then the rule of that detector
- `AreVulnerabilityTypesInSameFamilyOptions`, `areVulnerabilityTypesInSameFamily({ firstVulnerabilityType, secondVulnerabilityType })`: equal after normalization, or both in one entry of `vulnerabilityTypeFamilies`. Normalization ignores case, the `CWE` prefix with or without a dash or space, and leading zeros
- `vulnerabilityTypeFamilies`: the pairs the code rule treats as one weakness, CWE-79 with CWE-80 and CWE-22 with CWE-23
- `codeReviewLineTolerance`: 5, the lines the expected code range is widened by on each side
- `secretLineTolerance`: 2, the most a predicted secret start line may sit from the expected one

### score.ts

- `benchmarkCaseStatuses`, `BenchmarkCaseStatus`: completed, failed, skipped
- `BenchmarkCaseOutcome`: what the runner hands the scorer per case: the case, its findings, cost, duration, status and optional error message
- `MatchedFindingPair`: an `expectedFinding` and the `predictedFinding` that matched it
- `BenchmarkCaseDetail`: everything the scorer decided about one case: counts, matched pairs, unmatched predictions, missed expectations, pre-existing findings, cost, duration, status
- `BenchmarkRunScore`: the shared `BenchmarkScore` plus `caseDetails`
- `ScoreBenchmarkOptions`, `scoreBenchmark({ caseOutcomes })`: the pure scorer, returning a `BenchmarkRunScore` validated through `benchmarkScoreSchema`

### benchmark-repository.ts

- `OpenBenchmarkRepositoryOptions`, `openBenchmarkRepository({ repositoryUrl, baseSha, headSha, cacheDirectory? })`: clones the repository once under the cache directory and returns the pull-request-source module's `GitPullRequestSource` over the two shas
- `OfflineCloneError`: thrown by `openBenchmarkRepository` when the host cannot be resolved or connected to, or the offline variable is set, with the `repositoryUrl` it could not reach
- `offlineEnvironmentVariable`: the name `PULL_REQUEST_REVIEW_OFFLINE`
- `isGitSourceOffline()`: whether that variable is set and non-empty

### case-source.ts

- `PullRequestSourceOpen`, `OpenPullRequestSourceOptions`, `openPullRequestSource({ loadedCase, cacheDirectory })`: a snapshot source over the case's trees, or a git source over its shas: opened, skipped with the reason when the repository is unreachable, or failed with the error

### run.ts

- `RunBenchmarkOptions`, `RunBenchmarkRunOptions`, `runBenchmark({ pipeline, split, label, options? })`: runs the pipeline over the split, scores it, writes the four results files and returns the results. `options` holds `casesDirectory`, `resultsDirectory`, `cacheDirectory`, `reviewOptions` overrides, `auditSink`, `now` and `gitSha`, each with a default

### run-results.ts

- `benchmarkRunResultsSchema`, `BenchmarkRunResults`: the shape of a results file: label, split, times, git sha, prompt versions, model ids, advisory snapshot date, cache flag, the score with case details, the cases and the warnings

### results-page.ts

- `renderResultsPage(results)`: one self-contained html page with the provenance, the metrics table, the totals and a per-case table filtered in the browser by category, split and status

### error-messages.ts

- `describeError(error)`: the message of a thrown value
- `describeZodError(error)`: a zod error as one line naming each failing path

### validate.ts

- `runValidateCommand(options?)`: validates the corpus, prints the counts and the problems as `caseId: message` lines on stderr, and returns the exit status. Every directory defaults to the checked-in one. The file runs it when it is the entry point

### Test support

- `temporary-corpus.ts`: `makeTemporaryCorpus()`, `removeTemporaryCorpus(corpus)`, `writeCase({ casesDirectory, directoryName, benchmarkCase, files? })`, `makeSnapshotCase({ id, split })`, `makeGitCase({ id, split })`, `snapshotFilesWithChange()`, `fakeFixSha` and `temporaryAdvisoryId`: a corpus under `os.tmpdir()` with a one-package fixture app and an advisory fixture covering it
- `stub-pipeline.ts`: `makeStubPipeline({ throwingCaseId? })`, `makeClock()`, the three snapshot cases, the unreachable git case and the canned prompt versions and model ids the runner tests expect
- `test-environment.ts`: `saveEnvironmentVariables(names)` returning the `RestoreEnvironmentVariables` function that puts them back

## Inputs and outputs

The loader reads `benchmark/cases/<id>/case.json` through `benchmarkCaseSchema` and, for a snapshot case, the `base/` and `head/` trees beside it. The validator also reads `benchmark/fixtures/advisories/advisories.json` through `advisorySchema`, `known-clean.json`, and the fixture app's `bun.lock` and `package-lock.json`, and diffs every snapshot case through `SnapshotPullRequestSource`. The sources produce `ChangedFile`, `PullRequestDescription` and file text through the `PullRequestSource` interface, with git as the only diff engine. The runner hands each `ReviewPipeline` call a source, `ReviewOptions` and an `AuditSink`, takes back a `ReviewResult`, and the scorer turns its `Finding` values and the case's `ExpectedFinding` values into a `BenchmarkScore` plus case details. A run writes `<timestamp>-<label>.json`, `<timestamp>-<label>.html`, `latest-<split>.json` and `latest-<split>.html` under `benchmark/results`, with every character of the label outside `A-Za-z0-9._-` replaced by a dash, and prints one warning line per skipped case on stderr.

## Allowed imports

shared, pipeline, report, pull-request-source

Bun and Node built-ins and npm packages are always allowed.

`shared`, `pull-request-source` and `report` are imported today: the snapshot and git sources and `runGit` come from `pull-request-source`, and the page's `escapeHtml`, `pageStyle`, `formatCostUsd` and `emptyValueText` come from `report`. The pipeline is passed in as a function.

## Files

- `cases.ts`: the corpus and fixture directory constants, `resolveRepositoryRoot`, `loadBenchmarkCases`, the per-directory case read and `isDirectory`
- `cases.test.ts`: a two-case corpus loads sorted and filters by split, a malformed `case.json` throws, a missing cases directory loads nothing, and a `case.json` off the contract is a failed read naming the directory and the path
- `corpus-validation.ts`: `validateBenchmarkCorpus` and the per-case and corpus-wide checks: id equals directory, snapshot layout and source directory, git layout, clean consistency, a git source on a real-world case, the detector and fields each category's labels need, every labeled advisory id in the fixture as an id or an alias with a real-world advisory referencing the base sha, a snapshot head that differs from its base with every labeled line range inside the lines it adds, the category counts and the split coverage
- `corpus-validation.test.ts`: an id differing from its directory, identical trees, a code case marked clean, a code label outside the added lines and one on an unchanged file, a dependency label missing its advisory id, one with the wrong detector and one naming an advisory the fixture lacks while an alias passes, a secrets label without a start line, a real-world label without file and lines, a git case with a `base/` tree, a real-world advisory not referencing the base sha, well-formed cases of four categories reporting their counts, a lockfile disagreement and an uncovered package, and the checked-in corpus validating with zero problems
- `temporary-corpus.ts`: the temporary corpus, case and fixture writers the loader, validator and command tests share
- `fixtures.ts`: `readAdvisoryFixture` with the known-clean list read, and `checkFixtureApp` with the bun and npm lockfile readers, the lockfile comparison and the advisory coverage check
- `fixtures.test.ts`: the fixture reads with a missing `advisories.json`, an advisory off the contract, a missing and a malformed `known-clean.json`, and the app checks with agreeing lockfiles, a missing lockfile, a version only one lockfile holds beside an uncovered package, and a `bun.lock` that is not jsonc
- `match-rules.ts`: `matchesExpectedFinding` with the detector check, the dependency, code and secret rules, `areVulnerabilityTypesInSameFamily` with the vulnerabilityType normalization and the line range overlap
- `match-rules.test.ts`: detector mismatch, alias match in both directions, package mismatch, exact id and package comparison, a label without an advisory id, vulnerabilityType family, line tolerance inside and outside, one-line ranges, different file, no-file and no-lines labels, a prediction without lines, vulnerabilityType normalization, secret tolerance on both sides and three lines away, and secret labels without a file or a line
- `score.ts`: `scoreBenchmark`, the greedy one-to-one matching, the per-case counts with the pre-existing findings kept on every status, the micro average, the breakdowns by detector and category, the clean false positive count and the totals
- `score.test.ts`: duplicate predictions, two labels competing for one prediction, pre-existing exclusion, clean false positive, missed finding, a failed case keeping its pre-existing findings, skipped case, micro average, zero division and breakdown keys
- `benchmark-repository.ts`: `openBenchmarkRepository`, `OfflineCloneError`, the clone path under `benchmark-repositories`, the clone and fetch through the module's `runGit` with the offline and network failure classification, and the removal of the empty directories a failed clone leaves
- `benchmark-repository.test.ts`: a two-commit repository reached through a `file://` url: changed files, the clone under the cache directory, clone reuse, an existing clone while offline, the worktree checkout and its removal, the offline error before any clone, an unreachable url leaving no directory behind, a local path that is not a repository as a plain error, and a missing sha
- `case-source.ts`: `openPullRequestSource` over a snapshot case's trees or a git case's shas, with the skip and fail classification of a git open
- `case-source.test.ts`: a snapshot case opens on its head directory, an offline git case is skipped, a git case on a path that is not a repository fails
- `run.ts`: `runBenchmark`, the default review options, the per-case run with the source opened and disposed, the unrun case outcomes, the provenance collection, the results assembly and the results file writes
- `run.test.ts`: a stub pipeline over three snapshot cases in a temporary corpus: sorted call order with `isOffline` forced, the advisory fixture as the default advisory cache, the score, the four files with equal json, a label with path characters kept inside the results directory, the provenance, the page rows and filters, a throwing pipeline, a git case skipped while offline and a git case skipped on a clone that cannot connect
- `stub-pipeline.ts`: the stub pipeline with its canned findings, the cases the runner tests write and the fixed clock
- `run-results.ts`: `benchmarkRunResultsSchema` with the case detail and matched pair schemas
- `run-results.test.ts`: a results object round-trips, a case status outside the enum is rejected
- `results-page.ts`: `renderResultsPage` with the inline styles, the filter script, the provenance list, the metrics and case tables and html escaping
- `results-page.test.ts`: the overall and breakdown rows, the case rows with their filter attributes and formatted totals, html escaping of the label, warnings and error messages, and no warnings section without warnings
- `error-messages.ts`: `describeError` and `describeZodError`
- `error-messages.test.ts`: an Error, a string and a number described, and a zod error naming the root and two paths
- `test-environment.ts`: `saveEnvironmentVariables`
- `test-environment.test.ts`: a set variable returns to its value and an unset one to unset
- `validate.ts`: the `benchmark:validate` entry
- `validate.test.ts`: a corpus with an id and directory mismatch returns 1 with the case named on stderr, and the checked-in corpus returns 0 with its counts printed
- `tsconfig.json`: the module's composite TypeScript project, referencing shared, pipeline, report and pull-request-source
- `AGENTS.md`: this file

## Invariants

- Only findings whose `isIntroducedByPullRequest` is true are scored. The rest are listed as pre-existing on every case status and never count as true or false positives.
- Matching is greedy and one-to-one: expected findings in label order, each taking the first unmatched prediction that satisfies its rule, and a prediction matches at most one expected finding. Detectors are compared before any other rule. Package names and advisory ids are compared exactly.
- A failed case contributes every expected finding as a false negative and scores no prediction. A skipped case has zero counts and is left out of the totals, the breakdowns and the cost and duration sums.
- The scorer is pure: no file or network access, and the shared part of its result passes `benchmarkScoreSchema` before it is returned.
- `runBenchmark` forces `isOffline` to true whatever the caller passes, defaults `advisoryCacheDirectory` to `benchmark/fixtures`, the cache root of the advisory fixture, reads the run's snapshot date from its `advisories/npm/snapshot.json`, and runs the cases in sorted id order.
- A git case clones once into `<cache directory>/benchmark-repositories/<host>/<owner>/<repository>` and reuses the clone. Nothing is cloned when `PULL_REQUEST_REVIEW_OFFLINE` is set and the clone is missing, and a failed clone leaves no empty directory under the cache. Only a clone or fetch whose stderr names a resolution or connection failure is a skip. Any other failure is the case's error. The cache directory is `resolveCacheDirectory()` unless an option overrides it, so nothing is written inside the repository except under `benchmark/results`.
- Every pull request source is disposed after its case, whether the pipeline returned or threw.
- Every git command in the module and its tests runs through the pull-request-source module's `runGit`, which drops the variables a git hook exports. A `git init` or `git config` that inherited `GIT_DIR` would act on the repository that ran the hook instead of the temporary one, and the pre-commit hook runs the test suite.
- A run writes exactly four files, named from the label with every character outside `A-Za-z0-9._-` replaced by a dash: the timestamped json and html pair and the `latest-<split>` pair, and both json files hold the same content.
- The checked-in corpus holds 12 dependency, 15 code, 4 secrets, 15 clean and 8 real-world cases, each category with at least one dev and one test case, and `bun run benchmark:validate` exits non-zero when any count or check is off.
- Every label names the detector of its case's category and only the fields its rule reads. Every labeled advisory id is in the advisory fixture as an id or an alias. Every labeled line range of a snapshot case lies within the lines its head adds, checked against the same snapshot source the runner reads.
- Every snapshot case's `base/` is the fixture app with at most the changes its description names, and the fixture app's two lockfiles name the same packages at the same versions, every one of them covered by the advisory fixture or listed as known clean. The validator does not check the first half of this: the description is prose.
- Every `.ts` file under `benchmark/` starts with the file header comment and passes the formatter. The linter is off there through `benchmark/biome.json`.

## How to test

`bun test src/benchmark` runs every test in the module. The scorer, the rules, the results schema, the page and the diff parser tests are pure, the source, case source and runner tests build temporary repositories and corpora under `os.tmpdir()` and point `PULL_REQUEST_REVIEW_CACHE_DIR` at a temporary directory, restoring it afterwards, and the validator and command tests validate the checked-in corpus. `bun run benchmark:validate` validates the corpus and prints the counts by category and split. `bun check src/benchmark/run.ts` type-checks the module and `bunx biome check src/benchmark` lints and format-checks it.

## Known gaps

- The results page builds its own metrics and case tables with template strings on the report module's escaping, stylesheet and value formats. `renderHtmlReport` takes a `ReviewResult`, so a benchmark run has no page to render through it.
- The advisory fixture is the shared `Advisory` schema in one json file plus a `snapshot.json`. The advisories module decides its own cache format when it lands, and the fixture may need converting to it.
- `runBenchmark` defaults its advisory cache to `benchmark/fixtures`, the advisories module's 18-package subset, which lacks nine corpus advisories such as both `ms` advisories and the `PRR-TEST` entries. `bun index.ts benchmark run` passes a cache built from `advisories.json` instead, and any other caller has to do the same. The runner's tests use a stub pipeline. `benchmark/results` holds the baseline of both splits, and `latest-<split>` copies it. Nothing in `.gitignore` excludes the files a run writes there.
- `corpus-validation.ts` runs past the 400 lines a file is split at. The validator holds every check in one place on purpose.
- `isDirectory` in `cases.ts` is the same function as the one in `scripts/check-file-headers.ts`. Scripts are not importable from `src`, so a third copy belongs in `src/shared`.
