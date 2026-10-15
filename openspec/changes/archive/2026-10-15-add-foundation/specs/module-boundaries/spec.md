# Spec Delta

## Purpose

Keeps the modular monolith modular: each module under `src/` may import only the modules the allowed-imports matrix grants it, and a check fails on any violation so a boundary cannot erode by accident.

## ADDED Requirements

### Requirement: Module layout
The system SHALL organize source code as one directory per module under `src/`, with exactly these modules: shared, audit, run-state, pull-request-source, lockfile, advisories, matcher, reachability, secrets, prompts, llm, report, code-review, summarize, pipeline, benchmark, harness, server, cli. Every module directory SHALL exist even when it holds no code yet.

#### Scenario: Every module directory exists
- **WHEN** the repository is listed after this change lands
- **THEN** `src/` holds a directory for each of the nineteen modules and nothing else

### Requirement: Allowed-imports matrix
A module MAY import itself, Bun and Node built-ins and npm packages. It SHALL import other modules only as the allowed-imports matrix grants, and the matrix SHALL be the one listed in the scenario below.

#### Scenario: The matrix
- **WHEN** the boundary check loads its rules
- **THEN** the grants are exactly: shared imports no module; audit, run-state, pull-request-source, lockfile, advisories, matcher, reachability, secrets, prompts, llm and report import shared; code-review and summarize import shared, llm, prompts; pipeline imports every module except cli, benchmark, harness, server; benchmark imports shared, pipeline, report, pull-request-source; harness imports shared, benchmark, prompts, llm; server imports shared, pipeline, report, benchmark; cli imports shared, pipeline, report, benchmark, harness, server, advisories, matcher, pull-request-source

#### Scenario: A granted import passes
- **WHEN** a file in `src/code-review` imports a file in `src/llm`
- **THEN** the boundary check reports no violation

#### Scenario: An ungranted import fails
- **WHEN** a file in `src/audit` imports a file in `src/llm`
- **THEN** the boundary check reports a violation naming the importing file, the imported file and the rule broken

#### Scenario: Shared imports nothing
- **WHEN** a file in `src/shared` imports a file in any other module
- **THEN** the boundary check reports a violation

#### Scenario: A test may import its own module
- **WHEN** a test file inside `src/run-state` imports another file inside `src/run-state`
- **THEN** the boundary check reports no violation

#### Scenario: The path alias is resolved
- **WHEN** a file imports another module through the `@/` alias instead of a relative path
- **THEN** the boundary check resolves the alias to the target module and applies the same matrix

### Requirement: No barrel files
A module SHALL NOT expose an `index.ts` that only re-exports other files. Importers SHALL name the file that defines what they use.

#### Scenario: A barrel file is rejected
- **WHEN** a module directory under `src/` contains an `index.ts` whose statements are all re-exports
- **THEN** the boundary check reports a violation for that file

### Requirement: The boundary check is runnable and fails loudly
The system SHALL expose the boundary check as `bun run check:boundaries`. It SHALL exit non-zero and print every violation when at least one exists, and exit zero with no violations when the tree is clean.

#### Scenario: Clean tree
- **WHEN** `bun run check:boundaries` runs on a tree with no violations
- **THEN** it exits with status 0

#### Scenario: Bad-import fixture
- **WHEN** the check runs against a fixture tree that contains a deliberately ungranted import
- **THEN** it exits non-zero and its output names the offending import

### Requirement: The TypeScript check rejects cross-module imports where supported
The system SHALL attempt to make `bun check` reject an ungranted cross-module import through per-module project references. The outcome, kept or dropped, SHALL be recorded in `docs/decisions.md` with the reason.

#### Scenario: References honored
- **WHEN** `bun check` reports an error for a file in `src/audit` importing `src/llm` under the project references
- **THEN** the references are kept and `docs/decisions.md` records that `bun check` enforces boundaries

#### Scenario: References not honored
- **WHEN** `bun check` either ignores the references or breaks on them
- **THEN** the references are removed, `tsconfig.json` stays a single project, and `docs/decisions.md` records why and that the boundary check alone enforces boundaries
