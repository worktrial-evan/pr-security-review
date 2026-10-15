# Tasks

## 1. Fixture app and advisory fixture

- [x] 1.1 Write `benchmark/fixtures/app` per design D5: `package.json`, `src/` files on `Bun.serve` with the sqlite query, download, login with JWT, admin, template render, redirect, shell-out and upload routes, `bun.lock` from `bun install --lockfile-only`, and a `package-lock.json` for the same tree, and verify `bun --cwd benchmark/fixtures/app run src/server.ts --check` starts and both lockfiles name the same packages and versions
- [x] 1.2 Write `benchmark/fixtures/advisories/advisories.json`, `snapshot.json` and `known-clean.json` per design D4 with the real OSV advisories for every fixture package and the real-world packages plus the four synthetic entries, and verify every entry parses against `advisorySchema` and `snapshot.json` holds the sha256 of `advisories.json`
- [x] 1.3 Add `benchmark/biome.json` per design D10 and `benchmark/results/.gitkeep`, and verify `bunx biome check benchmark` passes with a deliberately unlinted fixture file present

## 2. Scorer

- [x] 2.1 Write `src/benchmark/score.ts` per design D7 with the dependency, code, secret and one-to-one rules, the pre-existing exclusion, the micro average, the breakdowns, the clean false positive count and the totals, and verify `bun check src/benchmark/score.ts` passes
- [x] 2.2 Write `src/benchmark/score.test.ts` covering alias match, package mismatch, CWE family, line tolerance inside and outside, different file, secret line tolerance, duplicate predictions, detector mismatch, pre-existing exclusion, clean false positive, missed finding, micro average, zero division and breakdown keys, and verify `bun test src/benchmark/score.test.ts` passes
- [x] 2.3 Write `docs/benchmark.md` with every matching rule, where the labels come from, the pre-existing exclusion, the metrics and F1 as primary with cost as tiebreak, and verify every rule named in the scoring spec appears in it

## 3. Pull request sources

- [x] 3.1 Write `src/benchmark/unified-diff.ts` parsing `git diff --unified=0` output into `ChangedFile` values with hunks, added lines, status, previous path and the binary flag, and `unified-diff.test.ts` over an added, a modified, a deleted, a renamed and a binary file, and verify `bun test src/benchmark/unified-diff.test.ts` passes
- [x] 3.2 Write `src/benchmark/snapshot-pull-request-source.ts` per design D2 and its test over temporary `base/` and `head/` trees covering added and modified files, null reads and the head checkout, and verify `bun test src/benchmark/snapshot-pull-request-source.test.ts` passes
- [x] 3.3 Write `src/benchmark/git-pull-request-source.ts` per design D2 and D3 and its test over a local repository with two commits reached through a `file://` url, covering the changed files, the clone under a temporary cache directory, the reuse of the clone and the offline skip, and verify `bun test src/benchmark/git-pull-request-source.test.ts` passes

## 4. Case loader and validator

- [x] 4.1 Write `src/benchmark/cases.ts` with `loadBenchmarkCases` (sorted by id, optional split filter) and `validateBenchmarkCorpus` applying every check in the corpus spec, and verify `bun check src/benchmark/cases.ts` passes
- [x] 4.2 Write `src/benchmark/validate.ts` as the `benchmark:validate` entry printing counts by category and split, add the `benchmark:validate` script to `package.json`, and verify `bun run benchmark:validate` prints the counts and exits 0 once the corpus exists
- [x] 4.3 Write `src/benchmark/cases.test.ts` covering the checked-in corpus validating clean, a case whose id differs from its directory being named, and a snapshot case with identical trees being named, and verify `bun test src/benchmark/cases.test.ts` passes

## 5. Dependency cases

- [x] 5.1 Write the 12 `sca-*` cases per design D6 covering every situation in the corpus spec, with labels naming package and advisory id and the withdrawn and fixed-version cases marked clean, and verify `bun run benchmark:validate` counts 12 sca cases

## 6. Code cases

- [x] 6.1 Write the 15 `code-*` cases, one weakness each on added lines with CWE, file and line range, and verify every label's line range lies within the added lines of its head and `bun run benchmark:validate` counts 15 code cases

## 7. Secrets and clean cases

- [x] 7.1 Write the 4 `secrets-*` cases with made-up credentials in the shapes the spec names and labels with file and line, and verify no value is a real token and `bun run benchmark:validate` counts 4 secrets cases
- [x] 7.2 Write the 15 `clean-*` cases with the tricky negatives the spec names, all with `isClean` true and empty expectations, and verify `bun run benchmark:validate` counts 15 clean cases

## 8. Real-world cases

- [x] 8.1 Select 8 advisories from the fixture with a FIX reference commit on a public npm repository, record clone url, fix sha as base and its parent as head, and label the advisory id, CWE, file and line range of the reversed fix, and verify each advisory's references hold the fix url and `bun run benchmark:validate` counts 8 real-world cases

## 9. Runner and results page

- [x] 9.1 Write `src/benchmark/run.ts` per design D8 and `results-page.ts` per design D9, and verify `bun check src/benchmark/run.ts` passes
- [x] 9.2 Write `src/benchmark/run.test.ts` running a stub pipeline over three snapshot cases into temporary results and cache directories, covering call order, `isOffline`, the two equal JSON files, the provenance fields, the page rows, a throwing pipeline and a skipped git case, and verify `bun test src/benchmark/run.test.ts` passes

## 10. Final verification

- [x] 10.1 bun run verify passes
- [x] 10.2 module AGENTS.md updated
