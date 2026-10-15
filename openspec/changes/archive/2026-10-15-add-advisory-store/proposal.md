# Proposal

## Why

The matcher needs advisories by package name, and the benchmark needs the same advisories on every run. Today the `advisories` module is empty, so there is no local copy of OSV and no stable subset for the benchmark.

## What Changes

- Add a refresh that downloads OSV's npm bulk export, parses every entry into the `Advisory` contract and writes a JSON index keyed by package name plus a snapshot file under the shared cache directory.
- Add a store that loads the index and serves `getByPackage` and `snapshot` through the `AdvisoryStore` contract, and a staleness check on a snapshot.
- Add `bun run refresh-advisories` and a script that regenerates the committed benchmark subset from a full cache.
- Commit the benchmark subset under `benchmark/fixtures/advisories`.
- Add a daily GitHub workflow that runs the refresh, fails on any parse failure and uploads the index as an artifact.

Decisions taken where the brief left a detail open:

- **Name normalization.** The lockfile parser does not exist yet, so this change defines the rule: trim, then lowercase. OSV lists 112 npm names with uppercase letters, such as `Haraka`. The store applies the rule on write and on lookup, so a lookup by the name a lockfile lists always hits. The lockfile module cannot import `advisories`, so it must apply the same rule on its own. Moving the rule into `src/shared` is a separate change.
- **`github_reviewed: false`.** No npm entry in the export has the literal value `false`. Malicious-package and GSD entries omit the field, which parses to `false`. The subset's "not reviewed" package is `faker.js`, whose GSD entry omits the field. The parser tests also cover a literal `false` with a hand-edited copy of a real entry.
- **Extra subset packages.** `mustache` has a withdrawn entry, `xmldom` has a `last_affected` range and `faker.js` is not GitHub reviewed.
- **Severity.** OSV gives CVSS vectors, never numbers. A CVSS v3 vector is preferred and its base score is computed with the CVSS 3.1 formula. A CVSS v4 vector without a v3 one is stored with no score.
- **Affected entries.** An affected item with no package is dropped, which applies to one entry today. Items from other ecosystems are kept in `affected` but not indexed.
- **Reference URLs without a scheme.** Two live entries list `github.com/npm/cli`, which the contract's URL check rejects. The parser prefixes `https://` to a URL that parses only with that prefix. Any other invalid URL still fails the refresh.
- **Subset size.** The subset index is 1.1 MiB, over Biome's default 1 MiB limit. A nested `biome.json` in the subset folder raises the limit for that folder only, the same way `test/fixtures/headers/biome.json` adjusts its folder.
- **Subset snapshot.** The subset's `snapshot.json` keeps the full snapshot's `fetchedAt`, `sourceUrl` and `sha256`, and its `entryCount` is the number of advisories in the subset.

## Capabilities

### New Capabilities

- `advisory-store`: the local OSV npm advisory cache, its refresh and canary workflow, lookup by package name, snapshot staleness, and the committed benchmark subset.

### Modified Capabilities

None.

## Impact

- New code in `src/advisories` and its `AGENTS.md`.
- New committed data in `benchmark/fixtures/advisories`, with a nested `biome.json` there, and OSV parse fixtures in `test/fixtures/advisories`.
- New workflow `.github/workflows/refresh-advisories.yml`.
- `package.json` gains one script, `refresh-advisories`. No dependency changes. `fflate` is already installed.
- The full index is written under the cache directory and never committed.
