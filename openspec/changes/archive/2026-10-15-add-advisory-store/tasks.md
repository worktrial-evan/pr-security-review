# Tasks

## 1. Parsing

- [x] 1.1 Copy real OSV entries into `test/fixtures/advisories/osv/` for each shape: CVSS v3, CVSS v4 only, withdrawn, `last_affected`, malicious package, no package, uppercase name, and a hand-edited copy with `github_reviewed: false`, and verify each file parses as JSON
- [x] 1.2 Write `src/advisories/cvss.ts` with the CVSS 3.x base score and its test, and verify `bun test src/advisories/cvss.test.ts` passes
- [x] 1.3 Write `src/advisories/package-name.ts` with the name normalization and `src/advisories/parse-osv.ts` mapping an OSV entry to an `Advisory`, with tests for every fixture shape, aliases, the three review flag cases and normalization, and verify `bun test src/advisories/parse-osv.test.ts` passes

## 2. Refresh and store

- [x] 2.1 Write `src/advisories/refresh-advisories.ts` (download, unzip, parse, atomic write of index and snapshot) with an offline test serving a zipped archive, a parse failure test and a network test gated on `RUN_NETWORK_TESTS=1`, and verify `bun test src/advisories/refresh-advisories.test.ts` passes
- [x] 2.2 Write `src/advisories/advisory-store.ts` (`loadAdvisoryStore`, `isSnapshotOlderThan`) with tests for case-insensitive lookup, an unknown package and staleness, and verify its test passes
- [x] 2.3 Write `src/advisories/refresh-advisories-command.ts`, add the `refresh-advisories` script to `package.json`, and verify `bun run refresh-advisories` completes against the real export

## 3. Benchmark subset

- [x] 3.1 Write `src/advisories/write-advisory-subset.ts`, run it against the full cache to produce `benchmark/fixtures/advisories/npm/`, and verify `bunx biome check benchmark` passes
- [x] 3.2 Add a lookup test over the committed subset covering every listed package, and verify it passes

## 4. Workflow

- [x] 4.1 Write `.github/workflows/refresh-advisories.yml` (daily cron, manual run, refresh, artifact upload), and verify by reading it that a failed refresh fails the job and that nothing is committed

## 5. Wrap-up

- [x] 5.1 Measure the full index load time and verify the number is recorded in `src/advisories/AGENTS.md`
- [x] 5.2 bun run verify passes
- [x] 5.3 module AGENTS.md updated: verify `src/advisories/AGENTS.md` lists every file in the module
