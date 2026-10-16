# Tasks

Every group ends with `bun check` and `bun test`. Nothing is committed until the last group passes `bun run verify`.

## 1. Baseline

- [x] 1.1 Run `bun test` on the synced tree and record the count (933 tests across 112 files, 932 pass, 1 skip) and verify it is written at the top of this group's notes before any rename
- [x] 1.2 Save the brief's grep output as the starting list of hits and verify the hits cover every module named in design.md

## 2. sca to dependency

- [x] 2.1 Rename `sca` in `src/shared`: the `DetectorKind` value, `ScaFinding`, `scaFindingSchema` and their tests and `AGENTS.md`, and verify `bun check` lists the remaining broken uses
- [x] 2.2 Fix every use in `src/` including the report detector label, `createScaFixture`, `ScaFixtureOptions`, `scaFixtureFindings` and the file `src/report/fixtures/dependency-findings.ts` (rename with `git mv`), and verify `bun check` is clean
- [x] 2.3 Rename `expectedScaFinding`, `matchesScaFinding`, `MatchesScaFindingOptions`, `makeScaCase`, `scaCase`, `scaCaseId`, `scaFindingId` and `scaFindingSample` in `benchmark` and tests, and verify `bun check` is clean
- [x] 2.4 Rename the twelve `sca-NN-*` case directories to `dependency-NN-*` with `git mv`, rename the category and detector values and ids in every `case.json`, recorded result in `benchmark/results`, fixture, snapshot, script and doc, and verify `grep -rnE "\bsca\b|Sca[A-Z]|sca-[0-9]" src scripts benchmark test config docs index.ts` returns nothing
- [x] 2.5 Update the module `AGENTS.md` files and `docs/` for this word, then verify `bun check` and `bun test` pass with 933 tests

## 3. cwe to vulnerabilityType

- [x] 3.1 Rename the field on `CodeReviewFinding` and `ExpectedFinding` in `src/shared` and their tests, and verify `bun check` lists the remaining uses
- [x] 3.2 Rename the code-review output schema field and its allowlist in `src/code-review`, then every derived name: `areCwesInSameFamily`, `AreCwesInSameFamilyOptions`, `cweFamilies`, `cweFamily`, `cweNumber`, `cwes`, `firstCwe`, `secondCwe`, `normalizeCwe`, `upperCaseCwe`, and verify `bun check` is clean
- [x] 3.3 Rename the report column key and set its header to "Vulnerability type (CWE)", leaving `CWE-89` style values as written, and verify the report tests and snapshots pass after the snapshots are updated by hand to the new key and header only
- [x] 3.4 Rename the key in every `case.json`, fixture, recorded result, prompt sample, doc and `AGENTS.md`, and verify `grep -rnE "[Cc]we[A-Z]|\bcwe\b" src scripts benchmark test config docs index.ts` returns nothing
- [x] 3.5 Verify `bun check` and `bun test` pass with 933 tests

## 4. Dir to Directory

- [x] 4.1 Rename every identifier ending in `Dir` or `Dirs` in `src/shared` and verify `bun check` lists the remaining uses
- [x] 4.2 Rename them in every other module, `scripts/`, `benchmark/` and tests, including `tempRunsDir` to `temporaryRunsDirectory`, `temporaryDir` to `temporaryDirectory` and the other names listed in the proposal, and verify `bun check` is clean
- [x] 4.3 Rename the benchmark case source field `dir` to `directory` in the schema, the loader and every `case.json`, and verify the corpus schema tests pass
- [x] 4.4 Update `AGENTS.md` files and docs, then verify `grep -rnE "[a-z]Dirs?\b|\bdir\b" src scripts benchmark test config index.ts` returns only Node and Bun names and `bun check` and `bun test` pass with 933 tests

## 5. repo to repository

- [x] 5.1 Rename the `PullRequestReference` field `repo` in `src/shared` and verify `bun check` lists the remaining uses
- [x] 5.2 Rename `repo`, `repoUrl`, `repoPath`, `repos` and the derived names such as `decoyRepoPath`, `targetRepoPath`, `missingRepoUrl` and `unreachableRepoUrl` in every module and test, and verify `bun check` is clean
- [x] 5.3 Rename the keys in every `case.json`, fixture, recorded result and doc, leaving the GitHub repository name `pr-security-review` and prose such as `owner/repo#number` command syntax decided by review, and verify the schema tests pass
- [x] 5.4 Update `AGENTS.md` files, then verify `grep -rnE "\brepo(s|Url|Path)?\b|Repo(Url|Path)" src scripts benchmark test config index.ts` returns only reviewed keep-list hits and `bun check` and `bun test` pass with 933 tests

## 6. Dependency scope and packageInfo

- [x] 6.1 Rename the `DependencyScope` values to `production` and `development` in `src/shared` and every producer and consumer, and verify `bun check` is clean
- [x] 6.2 Rename `isDevOnly`, `devLocations` and `devRootLocations` and every name built on them, leaving the benchmark split value `dev`, `devDependencies` and `listDevDependencyNames`, and verify `bun check` is clean
- [x] 6.3 Update the scope values in lockfile, reachability and report fixtures, recorded results and snapshots, and verify `grep -rnE "'prod'|isDev|devLocations|devRootLocations" src scripts benchmark test config index.ts` returns nothing
- [x] 6.4 Rename `packageInfo` to `packageMetadata` and verify `bun check` is clean
- [x] 6.5 Update `AGENTS.md` files and docs, then verify `bun check` and `bun test` pass with 933 tests

## 7. pr-review to pull-request-review

- [x] 7.1 Rename the `package.json` name, the commander program name, the GitHub User-Agent and the temporary directory prefixes, and verify the CLI help test and the audit sink test pass
- [x] 7.2 Update the `pr-review` text in `index.ts` and in `AGENTS.md` files, including the naming section of the root `AGENTS.md` that listed it as an exception, and verify `grep -rn "pr-review" src scripts benchmark test config index.ts package.json` returns nothing
- [x] 7.3 Check `bun.lock` for the workspace name and verify `bun install` reports no change after the rename

## 8. Specs and docs sweep

- [x] 8.1 Rename the keys and values in `openspec/specs/*/spec.md` and `docs/`, leaving archived changes as written, and verify `grep` for each old word in those paths returns only keep-list hits
- [x] 8.2 Run the brief's full grep over `src scripts benchmark test config index.ts package.json` and verify every remaining hit is a keep-list name, then list each in the summary
- [x] 8.3 `bun run verify` passes and the test count is still 933
- [x] 8.4 Module `AGENTS.md` updated: verify every module's `AGENTS.md` uses the new names for its Public API and Files sections

## Workflow follow-up

- Stage finished files as they are finished. Do not commit before the user archives the change.
- The user archives the change, then one commit holds the implementation, the planning artifacts and the archived change.
- `README.md` still says `pr-review`. A follow-up change names it in its Impact section.
