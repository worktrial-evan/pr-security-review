# Proposal

## Why

The code-style skill requires full words in names, and the codebase still carries abbreviations: `sca`, `cwe`, `Dir`, `repo`, `prod` and `dev`, `packageInfo` and `pr-review`. The pipeline, CLI and benchmark corpus now exist, so every later change would be written against these names and would multiply the rename. Doing it once, now, keeps the cost to one pass.

## What Changes

Every identifier, file name, key and value built on an old word is renamed, in code, data and docs. No behavior changes.

- `sca` becomes `dependency`: the detector kind and benchmark category value, `ScaFinding` and every `Sca` name in shared, benchmark and report, the file `src/report/fixtures/sca-findings.ts`, the report detector label and the `sca-NN-*` benchmark case directories and ids
- `cwe` becomes `vulnerabilityType`: the field on `CodeReviewFinding` and `ExpectedFinding`, the code-review output schema and its allowlist, every derived name, and the report column key. The header reads "Vulnerability type (CWE)". Values such as `CWE-89` stay
- `Dir` and `Dirs` become `Directory` and `Directories`: every identifier ending in them, `tempRunsDir` becomes `temporaryRunsDirectory`, and the benchmark case source field `dir` becomes `directory`
- `repo` becomes `repository`: the `PullRequestReference` field, `repoUrl`, `repoPath`, `repos` and every name built on them
- dependency scope values `prod` and `dev` become `production` and `development`, and `isDevOnly`, `devLocations` and `devRootLocations` become `isDevelopmentOnly`, `developmentLocations` and `developmentRootLocations`
- `packageInfo` becomes `packageMetadata`
- `pr-review` becomes `pull-request-review`: the package name, the commander program name, the GitHub User-Agent and the temporary directory prefixes
- the same keys and values are renamed in every `case.json`, fixture, recorded result, sample, snapshot, `AGENTS.md`, docs file and spec under `openspec/specs`
- **BREAKING** for stored data: recorded JSON, benchmark results and any saved review output use the new keys and values. The LLM response cache key includes the code-review output schema, so cached reviewer responses miss once after this change

Kept because they name external standards, formats or APIs: `CWE`, `CVE` and `GHSA` id values, `cvss`, `osv`, `jwt`, `sarif`, `json`, `jsonl`, `html`, `url`, `id`, `api`, `sdk`, `llm`, `f1`, `baseSha`, `headSha`, the `Ms` and `Usd` suffixes, npm's `devDependencies` field and `listDevDependencyNames`, the benchmark split value `dev`, the severity value `info`, the `max` and `min` prefixes, Node and Bun APIs such as `cwd`, `mkdir` and `tmpdir`, OSV JSON keys, and the GitHub repository name `pr-security-review`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a rename with no behavior change, so `.openspec.yaml` sets `skip_specs: true`. The specs under `openspec/specs` are edited in place to use the new names, because the brief for this change names them as a rename target.

## Impact

- Every module under `src/`, `scripts/`, `index.ts`, `benchmark/` (cases, fixtures, results), `test/fixtures/`, `config/`, every `AGENTS.md`, `docs/` and `openspec/specs/`
- Frozen files edited by this change: `package.json` (the `name` field only) and `src/shared/**` (the contracts and their tests). `README.md` is frozen and not named by this change, so it keeps `pr-review` and is left for a follow-up
- No dependency is added and no behavior changes. The test count stays at 933
