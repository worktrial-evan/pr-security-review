# verification-pipeline Specification

## Purpose
Gives the repository one verification command that the pre-commit hook and CI both run, so a change that passes locally passes in CI and a commit that would break the tree is rejected before it lands.

## Requirements

### Requirement: Single verify command
The system SHALL expose `bun run verify`, which runs these five checks in this order and stops at the first failure: the TypeScript check (`bun check`), the format and lint check (`biome check`), the boundary check (`check:boundaries`), the file header check (`check:headers`), and the test suite (`bun test`).

#### Scenario: All checks pass
- **WHEN** `bun run verify` runs on a clean tree
- **THEN** every check runs in order and the command exits with status 0

#### Scenario: An early check fails
- **WHEN** the TypeScript check reports an error
- **THEN** `bun run verify` exits non-zero and the later checks do not run

### Requirement: Fresh clone verifies clean
A fresh clone of the repository SHALL pass `bun install` followed by `bun run verify` with no manual steps in between.

#### Scenario: Fresh clone
- **WHEN** the repository is cloned into an empty directory and `bun install` then `bun run verify` run there
- **THEN** both commands exit with status 0

### Requirement: Pre-commit hook runs verify
Every `git commit` SHALL run the same five checks before the commit is created, and SHALL abort the commit when any check fails. The hook SHALL be installed by `bun install` so a fresh clone is protected without an extra step.

#### Scenario: Hook blocks a failing commit
- **WHEN** a staged file breaks the boundary check and the developer runs `git commit`
- **THEN** the commit is aborted and the boundary violation is printed

#### Scenario: Hook is installed by bun install
- **WHEN** `bun install` finishes in a fresh clone
- **THEN** `.git/hooks/pre-commit` exists and runs the five checks

### Requirement: CI runs verify
The continuous integration workflow SHALL run `bun install --frozen-lockfile` followed by `bun run verify` on every push and pull request, and SHALL fail when either command fails.

#### Scenario: Lockfile drift fails CI
- **WHEN** a push changes `package.json` without updating `bun.lock`
- **THEN** `bun install --frozen-lockfile` fails and the CI run is marked failed

### Requirement: File header rule
Every `.ts` file under `src/`, `scripts/` and `benchmark/` SHALL start with a `//` comment stating what the file does. The comment SHALL be on line 1, or on line 2 when line 1 is a shebang. `bun run check:headers` SHALL exit non-zero and list every file that breaks the rule.

#### Scenario: Headed file passes
- **WHEN** a file's first line is `// parses a bun lockfile into a dependency set`
- **THEN** the header check reports no problem for that file

#### Scenario: Shebang then header passes
- **WHEN** a file's first line is `#!/usr/bin/env bun` and its second line is a `//` comment
- **THEN** the header check reports no problem for that file

#### Scenario: Headerless fixture fails
- **WHEN** the check runs against a fixture file whose first line is an import
- **THEN** it exits non-zero and its output names that file

#### Scenario: Blank or block comment header fails
- **WHEN** a file starts with a blank line or a `/* */` block comment
- **THEN** the header check lists that file

### Requirement: Formatting and lint conventions
The formatter and linter SHALL enforce no semicolons, single quotes and sorted imports across the repository, and `biome check` SHALL exit non-zero on any formatting or lint difference.

#### Scenario: Unsorted imports fail
- **WHEN** a file's imports are out of the configured order
- **THEN** `biome check` reports the file and exits non-zero

#### Scenario: Formatted file passes
- **WHEN** a file uses single quotes, no semicolons and sorted imports
- **THEN** `biome check` reports no diagnostics for it

### Requirement: Worktree environment files
The repository SHALL hold a `.worktreeinclude` file at its root listing `.env` and `.env.local`, one per line, so a worktree created by the desktop app receives the environment files that `.gitignore` excludes from the tree.

#### Scenario: New worktree receives the environment files
- **WHEN** the desktop app creates a new worktree for the repository
- **THEN** the worktree receives `.env` and `.env.local` because `.worktreeinclude` lists them
