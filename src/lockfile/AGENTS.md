# lockfile module

## Purpose

Parses `bun.lock` and `package-lock.json` into the `DependencySet` contract, projects a set to a deterministic sorted list, diffs two sets and walks a set as a dependency graph.

## Public API

- `detectLockfiles(paths)`: returns one `DetectedLockfile` per lockfile in the list, in list order. A supported file name gives `{ status: 'supported', path, lockfileKind }`, a known but unsupported one gives `{ status: 'unsupported', path, fileName }`, and any other path is left out. It never throws
- `DetectedLockfile`: the union of the two results above
- `lockfileKindsByFileName`: the registry of supported file names: `bun.lock` to bun, `package-lock.json` to npm
- `unsupportedLockfileFileNames`: bun.lockb, npm-shrinkwrap.json, pnpm-lock.yaml, yarn.lock
- `ParseLockfileOptions`, `parseLockfile({ content, lockfileKind, lockfilePath, rootPackageJson })`: parses lockfile text and the root package.json text into a `DependencySet`. Throws `LockfileParseError` for an unsupported version or malformed text
- `LockfileParseError`, `LockfileParseErrorOptions`, `lockfileParseErrorReasons`, `LockfileParseErrorReason`: the typed error. It keeps `lockfileKind` and `reason`, which is unsupported-version or malformed
- `toSortedDependencyVersions(dependencySet)`: returns every version as one flat list sorted by name in code unit order, then semver ascending, then versions that are not semver in string order. This is the snapshot-tested projection
- `compareDependencyVersions({ first, second })`, `CompareDependencyVersionsOptions`: the comparator behind that order
- `isVersionUnparseable(version)`: true when a version string is not valid semver
- `DiffDependencySetsOptions`, `diffDependencySets({ baseDependencySet, headDependencySet })`: returns a `DependencyDiff`. A package that swaps exactly one version for one other is changed, any other difference is added or removed. A pull request introduces only the added and changed entries
- `buildDependencyGraph(dependencySet)`: returns a `DependencyGraph` whose `shortestPathTo(name)` lists name@version keys from a direct dependency down to the first version whose name or real package name matches, or an empty list
- `toDependencyKey(dependencyVersion)`: the name@version key used in `dependencyKeys` and graph paths

The parser building blocks are exported for the files in this module and are not meant for other modules: `parseBunLockfile`, `parseNpmLockfile`, `LockfileNode`, `ParsedLockfile`, `LockfileParser`, `LockfileParserOptions`, `toParsedLockfile`, `buildDependencySet`, `packageManifestSchema`, `PackageManifest`, `parsePackageManifest`, `resolveManifestLocations`, `ManifestLocations` and `listProductionDependencyNames`.

## Inputs and outputs

The module reads text only: lockfile content and the root package.json content, which the pipeline reads from git and passes in. It touches no file or network at runtime. It produces `DependencySet`, `DependencyVersion`, `DependencyDiff` and `DependencyGraph` from `src/shared/dependency.ts`.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `lockfile-registry.ts`: the file name and parser registries, `detectLockfiles` and `parseLockfile`
- `lockfile-registry.test.ts`: detection, every fixture case in both formats with explicit assertions and a snapshot, the same projection from both formats, determinism, npm version 1 and an unknown bun version rejected, malformed lockfile and package.json rejected, two names that differ only in case kept apart
- `bun-lock.ts`: the `bun.lock` parser. Reads jsonc with trailing commas and resolves a dependency of key `a/b` through `a/b/d`, then `a/d`, then `d`
- `npm-lock.ts`: the `package-lock.json` parser for versions 2 and 3. Reads the packages map and resolves dependencies up the node_modules folders the way node does
- `lockfile-node.ts`: the install node and parsed lockfile types every parser returns, the parser signature, and `toParsedLockfile`
- `lockfile-parse-error.ts`: `LockfileParseError` and its reasons
- `package-manifest.ts`: the four dependency maps of a package.json or workspace entry, `parsePackageManifest` and `resolveManifestLocations`
- `dependency-set.ts`: `buildDependencySet`, which turns install nodes into a `DependencySet`, and `toDependencyKey`
- `sorted-dependency-versions.ts`: `toSortedDependencyVersions`, `compareDependencyVersions` and `isVersionUnparseable`
- `dependency-diff.ts`: `diffDependencySets`
- `dependency-diff.test.ts`: one added, one bumped and one removed package in both formats, a set diffed with itself, and a second version reported as added
- `dependency-graph.ts`: `buildDependencyGraph`
- `dependency-graph.test.ts`: a transitive path, a direct target, a top level copy found before a nested one, a match by real package name and an unreachable name
- `lockfile-fixtures.ts`: reads a fixture case into lockfile text or a dependency set for the tests
- `fixtures/bun/<case>/` and `fixtures/npm/<case>/`: a lockfile and its package.json per case: scoped-multi-version, scopes, alias, workspace, specifiers, diff-base and diff-head. `fixtures/npm/scoped-multi-version` is lockfile version 2, `fixtures/npm/lockfile-v1` is the rejected version 1, and `fixtures/npm/case-variant-names` installs both `JSONStream` and `jsonstream`
- `__snapshots__/lockfile-registry.test.ts.snap`: the sorted projection of every fixture case in both formats
- `tsconfig.json`: the module's composite TypeScript project. It references `shared`, this module's row of the matrix
- `AGENTS.md`: this file

## Invariants

- Both formats go through `buildDependencySet`, so scope, direct flags, merging and order follow one set of rules.
- Every resolved version appears once per name@version. Several installed copies of one name@version merge: prod and direct win and their dependency keys are joined.
- Scope is dev only when the root or a workspace devDependencies reach a version and no production root does. An unreachable version is prod.
- A version is direct only when the root package.json lists its name and the root resolves that name to it. A nested copy of the same name is not direct.
- Every package keeps the exact name the lockfile installs it under, with its case unchanged. npm treats `JSONStream` and `jsonstream` as two packages, so they stay two entries. Matching a name against advisory data lowercases it with `normalizePackageName` from `src/shared/package-name.ts`, and that happens outside this module.
- An alias keeps the installed name as `name` and the aliased package as `realPackageName`, which is set only on an alias.
- A workspace version is `workspace:<path>` in both formats and has `isWorkspace` true. A git, file, link or tarball dependency keeps its specifier as the version. `isVersionUnparseable` is true for every version that is not valid semver.
- A dependency that resolves nowhere, such as a missing optional peer, is left out of `dependencyKeys`.
- The same input always gives the same output: names in code unit order, versions in the order of `compareDependencyVersions`, dependency keys sorted. No result depends on the locale, the clock or object key order in the lockfile.
- `detectLockfiles` never throws. `parseLockfile` throws only `LockfileParseError`.

## How to test

`bun test src/lockfile` runs every test and checks the snapshots. `bun test src/lockfile --update-snapshots` rewrites them after an intended change, and the snapshot diff is then reviewed by hand. `bun check src/lockfile/lockfile-registry.ts` type-checks the module and `bunx biome check src/lockfile` lints and format-checks it.

## Adding a lockfile kind

A new kind such as pnpm or yarn is one parser file and one line in each registry table:

1. Add the kind to `lockfileKinds` in `src/shared/dependency.ts`. That is a shared contract edit, so it is its own change that names `src/shared` in its Impact section.
2. Write `<kind>-lock.ts` exporting a `LockfileParser` that returns install nodes and calls `toParsedLockfile` with the root and workspace locations.
3. Map the file name to the kind in `lockfileKindsByFileName`, remove it from `unsupportedLockfileFileNames`, and add the parser to `lockfileParsersByKind`. The record type fails `bun check` until the parser is there.
4. Add `fixtures/<kind>/<case>/` for every shared case. The cross-format test then checks the new parser gives the same projection as the others.

## Known gaps

- `bun.lockb`, `npm-shrinkwrap.json`, `pnpm-lock.yaml` and `yarn.lock` are detected as unsupported and not parsed.
- npm's own `dev`, `optional` and `peer` flags are ignored. Scope is computed from the graph, so an optional dependency is prod.
- Workspace package.json files are not read. Workspace dependencies come from the lockfile, and the root package.json alone decides which versions are direct.
- When several versions of a package change at once, the diff reports added and removed entries instead of pairing them as changes.
- A git dependency in `bun.lock` keeps the `github:` specifier while `package-lock.json` keeps the resolved `git+ssh` url, so the same git dependency has a different version string in each format.
- `shortestPathTo` searches from every direct dependency, prod and dev alike. When paths of equal length exist, the one through the direct dependency first in sorted order wins.
