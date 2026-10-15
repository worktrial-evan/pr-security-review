# Proposal

## Why

The advisory store keys its index by a normalized npm package name, and the lockfile parser must produce names that hit that index. The rule lives in `src/advisories` today, which `lockfile` may not import, so the two modules would each keep their own copy.

## What Changes

- Add `normalizePackageName` to `src/shared` as the one npm package name rule: trim, then lowercase.
- Switch `src/advisories` to the shared function and delete its local copy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shared-contracts`: adds the package name normalization requirement.

## Impact

- `src/shared/**` is frozen, and this change edits it: a new `src/shared/package-name.ts`, its test, and `src/shared/AGENTS.md`.
- `src/advisories/package-name.ts`, its importers and `src/advisories/AGENTS.md` change. Behavior does not change.
- No dependency, matrix or configuration change.
