# matcher module

## Purpose

Matches every version in a dependency set against the OSV advisory ranges the advisory store serves, with a hand-written matcher as the runtime, osv-scanner as an optional oracle, and an agreement flag on every finding.

## Public API

- `matchDependencies({ dependencySet, dependencyDiff, advisoryStore })` and `MatchDependenciesOptions` in `match.ts`: the hand-written matcher. Returns `{ findings, audit }` with one `DependencyFinding` per package, version and advisory alias group, sorted by package name, version and advisory id, and a `MatchAudit` counting the withdrawn advisories and GIT ranges it skipped.
- `DependencyFinding`, `MatchAudit`, `MatchDependenciesResult`, `OraclePackage`, `OracleMatch`, `OracleResult`, `compareFindingOrder({ firstFinding, secondFinding })` and `CompareFindingOrderOptions` in `dependency-finding.ts`: the types the files share and the one order findings are sorted in: package name, version, advisory id, installed package name. A finding has `packageName` (the name the advisory is about), `installedPackageName` (the lockfile name, which differs only for an alias), `version`, `advisoryId`, `aliases`, `severity`, `confidence`, optional `cvssScore`, `isGithubReviewed`, `dependencyScope`, `isVersionUnparseable`, `isIntroducedByPullRequest`, `fixedVersions` and `matcherAgreement`. `OracleResult` is `{ status: 'ran', packages, matches }` or `{ status: 'unavailable', reason }`.
- `compareVersions({ first, second })` and `CompareVersionsOptions` in `affected-range.ts`: 0 for equal strings, semver precedence when both parse, else undefined. `matchAffectedPackage({ version, affectedPackage })`, `MatchAffectedPackageOptions` and `AffectedPackageMatch`: `{ isAffected, fixedVersions, ignoredGitRangeCount }` for one OSV affected entry. `isVersionUnparseable(version)`, `compareVersionOrder({ first, second })`, `compareCodeUnitOrder({ first, second })` and `sortUniqueVersions(versions)` are the ordering helpers the module sorts with.
- `groupMatchedAdvisories(matchedAdvisories)`, `listGroupIds(aliasGroup)`, `pickAdvisoryId(groupIds)` and `MatchedAdvisory` in `alias-group.ts`: union-find over ids and aliases, so advisories that share an id become one group, and the id a group is named after: its first GHSA id in code unit order, else its first id.
- `isOracleAvailable()`, `buildOracleArguments({ lockfilePath, databaseDirectory })`, `writeOracleDatabase({ advisories, databaseDirectory })`, `toOsvEntry(advisory)`, `runOracle({ lockfilePath, databaseDirectory })` `parseOracleOutput(outputJson)` and `describeError(thrownValue)` in `oracle.ts`, with `oracleBinaryName`, `oracleDatabaseArchivePath`, the options and result types `WriteOracleDatabaseOptions`, `WriteOracleDatabaseResult`, `RunOracleOptions` and `OracleOutput`, and the OSV entry types `OsvEntry`, `OsvAffected`, `OsvRange` and `OsvRangeEvent` the database writer emits.
- `reconcileMatches({ handwrittenFindings, oracleResult })` and `ReconcileMatchesOptions` in `reconcile.ts`: the union of both results with `matcherAgreement` set on every finding.
- `writeBoundaryLockfiles()`, `WriteBoundaryLockfilesResult`, `listBoundaryVersions({ packageName, advisories })`, `ListBoundaryVersionsOptions`, `boundaryLockfilesDirectory`, `readAdvisoryIndex(indexPath)`, `advisoryIndexSchema` and `AdvisoryIndex` in `write-boundary-lockfiles.ts`: regenerate the boundary lockfiles the validate command reads, and read an advisory index file in the cache layout into its advisories.
- `readFixtureAdvisories()`, `fixtureAdvisoriesPath`, `createFixtureAdvisoryStore(advisories)`, `createDependencyVersion({ name, version, ...overrides })`, `CreateDependencyVersionOptions`, `createDependencySet(versions)` and `createEmptyDependencyDiff()` in `matcher-fixtures.ts`: test helpers over the fixture advisory set.

## Inputs and outputs

The hand-written matcher reads a `DependencySet` and a `DependencyDiff` from `src/shared/dependency.ts` and asks an `AdvisoryStore` from `src/shared/advisory.ts` for the advisories of each version's real package name. It touches no file or network. It produces `DependencyFinding` values, which are not yet `DependencyFinding` values: the pipeline adds the finding id, reachability and the dependency path later.

The oracle writes `<databaseDirectory>/osv-scalibr/npm/all.zip`, one OSV JSON entry per advisory mapped back from the contract, and spawns the `osv-scanner` binary on PATH. Confirmed against osv-scanner 2.7.0 (osv-scalibr 0.5.3, `brew install osv-scanner`): the command line is `osv-scanner scan source --offline --local-db-path <databaseDirectory> --format json --all-packages --lockfile <lockfilePath>`, `--offline` makes it read that archive and nothing else, `--all-packages` lists every package in the JSON so package sets can be compared, exit code 0 means no vulnerabilities, 1 means some, 127 means the database could not be loaded and 128 means the lockfile held no packages. A missing database prints `could not load db for npm ecosystem` on stderr while still printing every package with no groups, and a lockfile with no packages prints `No package sources found` on stderr and nothing on stdout. The result is decided from those stderr lines and from whether stdout parses, never from the exit code: the load failure is unavailable, no package sources is a ran result with empty lists, parsed output is ran, and anything else is unavailable with the exit code and stderr in the reason. osv-scanner only matches a package-lock.json entry that has a `resolved` url. An entry without one is reported with `source=LOCAL` and gets no vulnerabilities.

`bun run validate-matcher` (`scripts/validate-matcher.ts`) runs both matchers over every lockfile under `benchmark/cases`, `src/lockfile/fixtures` and `src/matcher/fixtures/boundary-cases` against the subset under `benchmark/fixtures/advisories`, and exits non-zero on any disagreement without an accepted row in `docs/matcher-disagreements.md`.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed. The module uses `semver` for version precedence, `fflate` to zip the oracle database and `zod` to parse the oracle output.

## Files

- `match.ts`: `matchDependencies`, the lookup per version, the advisory and affected entry checks, the finding fields, the severity rule and the sort
- `match.test.ts`: every scenario of the matcher requirements over the fixture advisory set: alias merging, two versions of one package, determinism, the pull request flag, ecosystem and alias lookups, a listed version, fixed versions, withdrawn, GIT, severity thresholds, the medium fallback and the dependency and advisory fields
- `dependency-finding.ts`: the shared types and `compareFindingOrder`
- `affected-range.ts`: version comparison, the OSV range walk per affected entry and the ordering helpers
- `affected-range.test.ts`: introduced 0, fixed, lastAffected, no upper event, several ranges, ECOSYSTEM, out-of-order events, prerelease precedence, unparseable versions and events, fixed versions of matching ranges only, a GIT range, and the ordering helpers
- `alias-group.ts`: the union-find over advisory ids and aliases
- `oracle.ts`: the binary lookup, the argument list, the database writer, the OSV mapping, the run and the JSON parse
- `oracle.test.ts`: the recorded output, a malformed output, the written archive, a database load failure, the binary absent from PATH, and a live run. The two tests that run the binary skip when it is absent
- `reconcile.ts`: `reconcileMatches`
- `reconcile.test.ts`: one test per agreement value, the sorted output, an alias alone agreeing, and untouched inputs
- `write-boundary-lockfiles.ts`: the boundary lockfile generator. Run it with `bun src/matcher/write-boundary-lockfiles.ts` after the advisory subset changes
- `write-boundary-lockfiles.test.ts`: the boundary versions of a release event, a prerelease event, a listed version and introduced 0
- `matcher-fixtures.ts`: the fixture advisory store and the dependency set builders for the tests
- `fixtures/advisories.json`: 15 advisories covering introduced 0, fixed, lastAffected, a versions list, several ranges, a prerelease boundary, an unparseable listed version, a withdrawn advisory, a GHSA and CVE alias pair, a GIT range, a PyPI-only entry and every severity tier
- `fixtures/package-lock.json`: the lockfile the oracle tests scan: range-kit 1.0.0, alias-kit 1.0.2 and left-pad 1.3.0
- `fixtures/osv-scanner-output.json`: the JSON osv-scanner 2.7.0 printed for that lockfile against the fixture advisories
- `fixtures/boundary-cases/case-NN/`: the generated boundary lockfiles, every subset package at every range event version, the next patch version and a prerelease of each. The directory is not named coverage because `.gitignore` ignores that name
- `tsconfig.json`: the module's composite TypeScript project. It references `shared` only
- `AGENTS.md`: this file

## Invariants

- A version is looked up by its real package name when it is an alias, else by its name, through `normalizePackageName` from `src/shared/package-name.ts`. Only affected entries with ecosystem `npm` and that normalized name count.
- Range events are normalized to one key each and sorted by version with introduced `0` first and, at equal versions, introduced before lastAffected before fixed. Each introduced event pairs with the first upper event above it, so a repeated introduced `0` collapses into the first interval. When any event version other than `0` does not parse the events keep their document order. A version is affected when it is at or above an introduced event and below the next fixed event, at or below the next lastAffected event, or there is no upper event. Ranges and entries are unioned. A GIT range is counted and ignored.
- Versions compare by semver precedence, so a prerelease sorts below its release. A version or event that does not parse compares by string equality only, and a comparison that cannot be decided counts as not affected. Introduced `0` covers every version that parses and no version that does not.
- A withdrawn advisory produces no finding, never joins an alias group, and is counted in the audit when it covers the version. Its affected entries are walked like a live advisory's, so its GIT ranges are noted too. An alias of a live advisory stays in the group even when it names a withdrawn advisory, so a group can be named after a withdrawn GHSA id. Advisories the store returns twice are matched once.
- Findings are one per installed package name, version and alias group, sorted by package name, version, advisory id and installed name. Advisories that share an id or alias merge into one finding. The advisory id is the group's first GHSA id in string order, else its first id. Severity, cvssScore and isGithubReviewed take the strongest value in the group, fixedVersions the sorted union.
- Severity comes from the CVSS score: critical at 9 and above, high at 7, medium at 4, else low, with confidence 0.9. Without a score the finding is medium with confidence 0.5.
- A finding is introduced by the pull request only when its version is in the diff's added entries or is the new version of a changed entry.
- The hand-written matcher sets `matcherAgreement` to oracle-unavailable, and only `reconcileMatches` sets both, handwritten-only or oracle-only. A hand-written finding and an oracle match agree when they name the same normalized package name and version and share at least one id. An oracle-only finding has severity medium, confidence 0.5, scope production, no fixed versions and is not introduced by the pull request.
- The oracle database is written from the advisories the store serves, so both matchers see one advisory set and the validate command needs no network.
- Every result is deterministic: findings and matches are sorted and deduplicated, and nothing depends on the clock or object key order. `reconcileMatches` sorts on every branch, and `parseOracleOutput` returns each package and match once even when osv-scanner lists a lockfile twice.

## How to test

`bun test src/matcher` runs every test. The two oracle tests that spawn the binary skip when `osv-scanner` is not on PATH. `bun check src/matcher/match.ts` type-checks the module and `bunx biome check src/matcher` lints and format-checks it. `bun run validate-matcher` compares both matchers over every fixture lockfile and must exit zero.

## Known gaps

- The `Advisory` contract has no `database_specific` severity, so an advisory without a CVSS score falls straight to medium instead of using the GitHub severity label. Adding that field is a shared-contract change of its own.
- Only npm is matched. An affected entry of another ecosystem is skipped.
- An oracle-only finding carries defaults instead of the advisory's severity, scope and fixed versions, because the hand-written matcher saw no advisory for it.
- The oracle database maps only the fields osv-scanner matches on. Severity vectors and references are not written back.
- The boundary lockfiles are package-lock.json only. The bun.lock specifier and workspace differences are covered by the lockfile module's fixtures.
- The disagreement table matches accepted rows by lockfile, package, kind, side and ids. A new lockfile with the same specifier difference needs its own row.
- `isVersionUnparseable`, `compareVersionOrder` and `compareCodeUnitOrder` repeat the rules of `src/lockfile/sorted-dependency-versions.ts`, because the matcher may import only `shared`. Moving the three into a shared version-order module is a shared-contract change of its own.
