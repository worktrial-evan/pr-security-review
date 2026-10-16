# Proposal

## Why

Three modules keep a private copy of the same code unit string comparator: `compareStrings` in `src/lockfile`, `comparePaths` in `src/pull-request-source` and `compareStrings` in `src/code-review`. One rule in one place keeps the three orders equal and gives the next module nothing to copy.

## What Changes

- Add `compareStrings({ first, second })` to `src/shared` as the one code unit string comparator.
- Switch `src/lockfile`, `src/pull-request-source` and `src/code-review` to the shared function and delete their local copies. Behavior does not change: every order stays code unit order.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shared-contracts`: adds the string comparison requirement.

## Impact

- `src/shared/**` is frozen, and this change edits it: a new `src/shared/compare-strings.ts`, its test, and `src/shared/AGENTS.md`.
- `src/lockfile/sorted-dependency-versions.ts`, `src/pull-request-source/changed-file.ts`, `src/pull-request-source/snapshot-pull-request-source.ts`, `src/code-review/review-packet.ts` and `src/code-review/dedupe-findings.ts` switch imports. `sortChangedFiles` becomes `sortFilesByPath` over anything with a path, with the exported `FileWithPath` type, so the snapshot source's rename pairing sorts through it too, and `src/pull-request-source/git-pull-request-source.ts` follows the rename. `src/code-review/compare-strings.ts` and its test are deleted. The three module `AGENTS.md` files follow.
- No dependency, matrix or configuration change. Every snapshot stays as it is.
