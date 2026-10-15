## Why

A vulnerable dependency matters more when the head checkout imports it than when it is unused or only pulled in by another package. The reachability module is empty, so every SCA finding lacks the reachability, importedBy and dependencyPath values its contract requires.

## What Changes

- Add `collectImports`, which walks the head checkout once, parses each source file with ts-morph for syntax only, and returns the files importing each npm package.
- Add `classifyReachability`, which labels one package direct-imported, direct-unused or transitive from that import map, the dependency set and the dependency graph.
- Write the scanned file count and parse time to the audit sink, and stop at a configurable file cap with a warning.
- Fill in `src/reachability/AGENTS.md`, including the call-level reachability gap.

Decisions taken where the brief left a detail open:

- Files are found by a directory walker that prunes the excluded directories and skips every symbolic link, then added to the ts-morph Project from their text. ts-morph's own glob follows symbolic links, so it is not used.
- A specifier names a package only when it is a bare or scoped npm name. Anything starting with `.`, `/`, `~`, `#` or `@/`, or holding a protocol colon, is a relative or alias path and is ignored. A tsconfig alias that looks like a bare name is counted as a package.
- `import type` and `export type` declarations are ignored, since they are erased at runtime.
- A package any file imports is direct-imported even when it is not a direct dependency. Otherwise a direct dependency is direct-unused, and anything else is transitive.
- Every classification includes `dependencyPath` from the graph, so the result drops straight into the SCA finding fields.
- `collectImports` returns the import map with the file count, parse time and warnings beside it. The default file cap is 10000.
- The fixture repository's TypeScript files are excluded from the module's `tsconfig.json`, since they import packages that are not installed.

## Capabilities

### New Capabilities

- `dependency-reachability`: import collection over a checkout and the direct-imported, direct-unused or transitive classification of a package

### Modified Capabilities

None.

## Impact

- New code, tests and fixtures under `src/reachability/`, plus its `AGENTS.md`.
- `src/reachability/tsconfig.json` gains an `exclude` for the fixture repository. The root `tsconfig.json` is untouched.
- Uses the existing `ts-morph` dependency and the shared `DependencySet`, `DependencyGraph`, `AuditSink` and `ScaFinding` contracts. No frozen file changes.
