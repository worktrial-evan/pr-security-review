# Proposal

## Why

The shared-contracts spec says every module that keys data by npm package name must normalize the name. The lockfile parser keys dependency sets, diffs and graph edges by the exact installed name and never normalizes. npm treats names that differ only in case, such as `JSONStream` and `jsonstream`, as two packages, so normalizing in the lockfile would merge distinct packages. The requirement is wrong, not the lockfile.

## What Changes

- Narrow the package name requirement: names are normalized when they are matched against advisory data, and an installed package keeps its exact name.
- Add a lockfile requirement and test that two names differing only in case stay two entries.
- Reword the shared and lockfile module docs to match.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shared-contracts`: the package name normalization requirement covers matching against advisory data only.
- `lockfile-parsing`: adds the rule that installed package names stay exact.

## Impact

- `src/shared/**` is frozen, and this change edits it: the header comment of `src/shared/package-name.ts` and `src/shared/AGENTS.md`. The function does not change.
- `src/lockfile`: a new npm fixture `case-variant-names`, a test in `lockfile-registry.test.ts`, and `AGENTS.md`. No lockfile code changes.
- No runtime behavior changes. The advisory store already normalizes on lookup.
