# advisories module

## Purpose

Builds a local cache of the OSV npm advisories from the bulk export and serves it by package name through the `AdvisoryStore` contract.

## Public API

- `refreshAdvisories({ ecosystem, cacheDir, sourceUrl?, now? })` in `refresh-advisories.ts`: downloads the OSV export, parses every entry, and writes the index and snapshot. Returns the snapshot, both paths and the package count. `sourceUrl` replaces the OSV URL in tests.
- `AdvisoryParseError` in `refresh-advisories.ts`: thrown when any entry does not parse. Its `failures` list each entry name and message.
- `indexAdvisoriesByPackage(advisories)` in `refresh-advisories.ts`: groups advisories under every npm package they affect, sorted by package name and then by advisory id.
- `loadAdvisoryStore(cacheDir)` in `advisory-store.ts`: loads the npm index and snapshot into memory and returns an `AdvisoryStore`.
- `isSnapshotOlderThan(snapshot, hours)` in `advisory-store.ts`: says whether a snapshot was fetched more than that many hours ago.
- `parseOsvEntry(entry)` and `ParseOsvEntryResult` in `parse-osv.ts`: map one OSV entry onto `Advisory`, or report which fields do not fit.
- `normalizePackageName(name)`, `listAffectedNpmPackageNames(advisory)` and `npmEcosystem` in `package-name.ts`: the name rule the index and lookups share, and the npm packages an advisory affects.
- `computeCvss3BaseScore(vector)` in `cvss.ts`: the CVSS 3.x base score of a vector, or undefined for anything else.
- `advisoryEcosystems`, `AdvisoryEcosystem`, `resolveAdvisoryCachePaths({ cacheDir, ecosystem })` and `resolveOsvArchiveUrl(ecosystem)` in `cache-layout.ts`: where the files live and where the export comes from.
- `writeAdvisorySubset({ sourceCacheDir, targetCacheDir, packageNames })`, `benchmarkAdvisoryPackageNames` and `benchmarkAdvisoryCacheDir` in `write-advisory-subset.ts`: regenerate the committed benchmark subset.
- `runRefreshAdvisoriesCommand()` in `refresh-advisories-command.ts`: the body of `bun run refresh-advisories`.

## Inputs and outputs

A refresh reads `https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip` and writes two files under `resolveCacheDirectory()` from `src/shared/cache-directory.ts`:

- `advisories/npm/index.json`: one JSON object mapping each normalized npm package name to its `Advisory` list
- `advisories/npm/snapshot.json`: an `AdvisorySnapshot` with fetchedAt, sourceUrl, entryCount and the sha256 of the zip

`loadAdvisoryStore` reads the same two files and returns an `AdvisoryStore` from `src/shared/advisory.ts`.

The committed subset under `benchmark/fixtures/advisories/npm/` uses the same layout, so the benchmark calls `loadAdvisoryStore` on `benchmark/fixtures`. Its snapshot keeps the source snapshot's fetchedAt, sourceUrl and sha256, and its entryCount is the number of advisories in the subset. `benchmark/fixtures/advisories/biome.json` raises Biome's file size limit for that folder only, because the subset index is just over 1 MiB.

Measured on 2026-10-15 against the export fetched that day, which held 230,361 entries for 225,818 package names:

| Step | Time | Size |
| --- | --- | --- |
| `bun run refresh-advisories`, download and one load included | 27 s | 3.3 GB peak memory |
| full index load in a fresh process | 0.5 s | 257 MB file, 1.4 GB resident |
| lookup of lodash | 4 ms | 10 advisories |
| subset load | 4 ms | 1.1 MB file |

`bun run refresh-advisories` prints the refresh and load times on every run.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `refresh-advisories.ts`: the download, in-memory unzip, parse and atomic write of the index and snapshot
- `refresh-advisories.test.ts`: refresh from archives served locally, a malformed entry and a non-JSON entry failing without touching the cache, a failed download, and the real export when `RUN_NETWORK_TESTS=1`
- `refresh-advisories-command.ts`: the entry run by `bun run refresh-advisories`
- `advisory-store.ts`: the in-memory store over the JSON index and the snapshot staleness check
- `advisory-store.test.ts`: lookups by name in any case, an unknown package, copies on every lookup, a missing cache and staleness
- `parse-osv.ts`: the mapping from an OSV entry to an `Advisory`
- `parse-osv.test.ts`: every OSV fixture shape, aliases, references, the review flag true, false and absent, and malformed entries
- `package-name.ts`: name normalization and the npm packages an advisory affects
- `cvss.ts`: the CVSS 3.x base score
- `cvss.test.ts`: scores checked against the CVSS 3.1 calculator, v4 and malformed vectors
- `cache-layout.ts`: the cache paths and the OSV export URL
- `osv-fixtures.ts`: reads the OSV fixtures in `test/fixtures/advisories/osv` for the tests
- `write-advisory-subset.ts`: regenerates the benchmark subset from the shared cache. Run it with `bun src/advisories/write-advisory-subset.ts` after a refresh
- `benchmark-subset.test.ts`: every listed package found in the committed subset, the withdrawn, last_affected and unreviewed cases, and the subset's own snapshot
- `tsconfig.json`: the module's composite TypeScript project. It references `shared` only
- `AGENTS.md`: this file

## Invariants

- Every lookup goes through `normalizePackageName`, which trims and lowercases. The index is keyed by the same rule. Returned advisories keep the names exactly as OSV wrote them.
- A refresh writes nothing unless every entry parses. The index and snapshot are written to temporary files and renamed into place.
- `getByPackage` parses what it returns through `advisorySchema`. Each lookup returns fresh objects, so a caller cannot change the store.
- An affected item with no package is dropped. Items from other ecosystems stay in `affected` but are not indexed.
- The severity vector comes from the CVSS v3 entry when there is one, else the CVSS v4 entry. Only a v3 vector gets a score.
- A reference URL without a scheme, such as `github.com/npm/cli`, gets `https://` prefixed. Any other invalid URL fails the parse.
- The full index lives only under the cache directory and is never committed. The daily workflow uploads it as an artifact.
- Storage stays behind `loadAdvisoryStore`. Callers depend only on `AdvisoryStore`, so a `bun:sqlite` store can replace the JSON index without changing them.

## How to test

`bun test src/advisories` runs every test without the network. `RUN_NETWORK_TESTS=1 bun test src/advisories` adds a refresh against the real export. `bun run refresh-advisories` refreshes the shared cache. `bun src/advisories/write-advisory-subset.ts` then regenerates the committed subset.

## Known gaps

- The full index costs about 1.4 GB of memory once loaded. A `bun:sqlite` store would load lazily.
- CVSS v4 vectors have no computed score.
- No npm entry in the export carries `github_reviewed: false`. Malicious-package and GSD entries omit the field, which parses to false. The subset uses `faker.js` for that case.
- The lockfile module must apply the same name rule. It cannot import this module, so the rule should move to `src/shared` in a change that names it.
- Lowercasing merges names that differ only in case, such as `jquery` and `jQuery`.
- OSV GIT ranges lose their `repo` field because the contract has none.
- Only npm is supported.
