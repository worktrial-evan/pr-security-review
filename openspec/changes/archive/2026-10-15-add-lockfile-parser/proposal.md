# Proposal

## Why

The software composition analysis stage needs to know which dependency versions a pull request brings in. `src/lockfile` is empty, so nothing turns a `bun.lock` or `package-lock.json` into the `DependencySet` contract yet.

## What Changes

- Fill `src/lockfile` with lockfile detection through a registry keyed by file name, parsers for `bun.lock` and `package-lock.json` versions 2 and 3, a deterministic sorted projection, a diff between two sets and a dependency graph with shortest-path lookup.
- Add fixture lockfiles for both formats under `src/lockfile/fixtures` and snapshot tests of the sorted projection.

Open details settled here with the simplest option that meets the spec:

- `parseLockfile` also takes `lockfilePath`, because the `DependencySet` contract requires it. The kind option is named `lockfileKind`, the contract's own field name. `rootPackageJson` is the file's text, like `content`.
- `diffDependencySets` takes `{ baseDependencySet, headDependencySet }`, an options object, because the code-style skill requires one for two parameters of the same type.
- A package whose name loses exactly one version and gains exactly one version is a change. Any other version difference is reported as separate added and removed entries.
- A version that cannot be traced to the root's devDependencies, including an orphan entry, is `prod`. An unreachable entry is never silently downgraded to `dev`.
- A workspace, git, file, link or tarball entry keeps its specifier as the version string, for example `workspace:packages/utils`, and `isVersionUnparseable` is true for every version that is not valid semver.
- `bun.lock` versions 0, 1 and 2 are accepted. Any other version, and `package-lock.json` version 1 or above 3, is rejected with a typed error.
- `shortestPathTo` matches a package by its name or its real package name, and returns an empty list when nothing reaches it.

## Capabilities

### New Capabilities

- `lockfile-parsing`: detecting supported lockfiles, parsing them into dependency sets, the sorted projection, the diff and the dependency graph.

### Modified Capabilities

None.

## Impact

- New code only in `src/lockfile`, with its fixtures, snapshots and `AGENTS.md`.
- No dependency, shared contract or frozen file changes. It uses `jsonc-parser`, `semver` and `zod`, which are already installed, and `src/shared/dependency.ts` as it is.
- Adding `pnpm-lock.yaml` or `yarn.lock` later needs one parser file and one registry entry here, plus a new value in `lockfileKinds` in `src/shared/dependency.ts`, which is its own change.
