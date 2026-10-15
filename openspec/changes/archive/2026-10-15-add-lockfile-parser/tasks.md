# Tasks

## 1. Shared building blocks

- [x] 1.1 Write `src/lockfile/lockfile-node.ts` (install node and parsed lockfile types, the parser signature), `src/lockfile/lockfile-parse-error.ts` (`LockfileParseError`) and `src/lockfile/package-manifest.ts` (root package.json and workspace dependency maps), and verify `bun check src/lockfile/package-manifest.ts` passes
- [x] 1.2 Write `src/lockfile/sorted-dependency-versions.ts` (`compareDependencyVersions`, `toSortedDependencyVersions`) and `src/lockfile/dependency-set.ts` (scope walk, merge by name@version, sorted map), and verify `bun check src/lockfile/dependency-set.ts` passes

## 2. Parsers and registry

- [x] 2.1 Write `src/lockfile/bun-lock.ts` and the bun fixtures under `src/lockfile/fixtures/bun/` for scoped and multi-version, scopes, alias, workspace, specifiers and the diff pair, and verify `bun check src/lockfile/bun-lock.ts` passes
- [x] 2.2 Write `src/lockfile/npm-lock.ts` and the npm fixtures under `src/lockfile/fixtures/npm/` for the same cases plus a version 1 lockfile, with one fixture at version 2, and verify `bun check src/lockfile/npm-lock.ts` passes
- [x] 2.3 Write `src/lockfile/lockfile-registry.ts` (`detectLockfiles`, `parseLockfile`), the test fixture reader `src/lockfile/lockfile-fixtures.ts` and `src/lockfile/lockfile-registry.test.ts` covering detection, every fixture in both formats with explicit assertions and a snapshot of the sorted projection, version 1 rejected, malformed content rejected and the determinism check, and verify `bun test src/lockfile/lockfile-registry.test.ts` passes

## 3. Diff and graph

- [x] 3.1 Write `src/lockfile/dependency-diff.ts` (`diffDependencySets`) and its test on the diff fixtures in both formats with one added, one bumped and one removed, and verify `bun test src/lockfile/dependency-diff.test.ts` passes
- [x] 3.2 Write `src/lockfile/dependency-graph.ts` (`buildDependencyGraph`) and its test with a transitive path, a direct target, a real package name match and an unreachable name, and verify `bun test src/lockfile/dependency-graph.test.ts` passes

## 4. Final verification

- [x] 4.1 bun run verify passes
- [x] 4.2 module AGENTS.md updated: `src/lockfile/AGENTS.md` lists every file, the public API, the invariants and the extension point for new lockfile kinds, and verify it names every file in `src/lockfile`

## Workflow follow-up

- The user archives the change when they consider it finished.
