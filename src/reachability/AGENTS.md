# reachability module

## Purpose

Decides whether a vulnerable dependency is directly imported, direct but unused, or transitive. This is import-level reachability: it knows which files import a package, not whether the vulnerable function inside that package is ever called.

## Public API

### collect-imports.ts

- `collectImports({ rootDirectory, auditSink, runId, maxFileCount? })`: scans the source files under `rootDirectory` once and returns an `ImportCollection`
- `ImportCollection`: `imports`, `fileCount`, `parseDurationMs` and `warnings`
- `ImportsByPackage`: a `Map` from package name to the sorted root-relative paths of the files importing it, in package name order
- `CollectImportsOptions`: the options of `collectImports`
- `defaultMaxFileCount`: 10000, the file cap when the caller sets none
- `reachabilityAuditStep`: `reachability`, the step name on the scan's audit event

### classify-reachability.ts

- `classifyReachability({ packageName, dependencySet, dependencyGraph, imports })`: returns a `ReachabilityClassification`
- `ReachabilityClassification`: `reachability`, `importedBy` and `dependencyPath`, picked from `DependencyFinding` so the result spreads into a dependency finding
- `ClassifyReachabilityOptions`: the options of `classifyReachability`

### package-specifier.ts

- `toPackageName(specifier)`: returns the npm package a module specifier names, or null for a builtin, a relative path or an alias path

### source-files.ts

- `listSourceFiles({ rootDirectory, maxFileCount })`: returns a `SourceFileListing` with the resolved root, the absolute paths of the source files, whether the cap stopped the walk, and warnings for unreadable directories
- `excludedDirectoryNames`: `node_modules`, `dist`, `build`, `coverage`, `cache` and `runs`
- `ListSourceFilesOptions`, `SourceFileListing`: the options and result of `listSourceFiles`

## Inputs and outputs

`collectImports` reads the head checkout directory from `PullRequestSource.checkoutHead` and writes one `note` event to the `AuditSink` from `src/shared/audit.ts`, with `fileCount`, `parseDurationMs`, `maxFileCount`, `isFileCapReached` and `warnings` in its payload and the parse time as `durationMs`. `classifyReachability` reads the head `DependencySet` and `DependencyGraph` from `src/shared/dependency.ts`, which the lockfile module builds, and returns the `reachability`, `importedBy` and `dependencyPath` fields of `DependencyFinding` from `src/shared/finding.ts`.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `collect-imports.ts`: `collectImports`, the in-memory syntax-only ts-morph project, the import forms it reads and the audit event
- `collect-imports.test.ts`: every import form across the eight extensions, scoped and subpath packages, type-only, builtin, alias and computed specifiers left out, excluded directories and symbolic links never read, the audit event, the cap warning, and no warning when the cap equals the file count
- `classify-reachability.ts`: `classifyReachability` and the `ReachabilityClassification` type
- `classify-reachability.test.ts`: direct-imported, direct-unused and transitive over one scan of the sample repository, the shortest of two paths, an imported package missing from the direct dependencies, and one audit event across every classification
- `package-specifier.ts`: `toPackageName`, the specifier to package name rule
- `package-specifier.test.ts`: bare, subpath and scoped names kept, Node and Bun builtins, relative, absolute, alias, protocol and malformed specifiers dropped
- `source-files.ts`: `listSourceFiles`, the breadth-first walk that skips symbolic links and excluded directories and stops at the cap
- `fixtures/sample-repository/`: a small repository with every import form in ts, tsx, mts, cts, js, jsx, mjs and cjs files. It is excluded from the module's TypeScript project because it imports packages that are not installed
- `fixtures/sample-dependencies.ts`: the dependency set of the sample repository, with an unused direct dependency and a transitive dependency reached by two routes, and a breadth-first graph over it
- `tsconfig.json`: the module's composite TypeScript project. It references `shared` and excludes the sample repository
- `AGENTS.md`: this file

## Invariants

- One scan serves a whole run. `collectImports` runs once per head checkout and `classifyReachability` is a pure lookup over its `imports`, so classifying many findings never parses a file twice.
- The scan never follows a symbolic link, never enters an excluded directory at any depth, and never reads a file whose real path is outside the real path of `rootDirectory`.
- The scan reads syntax only. The ts-morph project uses an in-memory file system, reads no tsconfig, loads no lib files and resolves no import.
- The scan stops before reading more than `maxFileCount` files and reports a warning only when a file beyond the cap exists.
- Only runtime imports count: import declarations, export-from declarations, import-equals requires, and `import()` and `require()` with a string literal or a template literal without substitutions. Type-only imports and exports do not count.
- A specifier names a package only when it is a bare or scoped npm name. Anything starting with `.`, `/`, `~`, `#` or `@/`, anything with a protocol colon, and any Node or Bun builtin from `builtinModules` names none.
- A package any file imports is direct-imported even when it is missing from the direct dependencies. Every classification includes the graph's shortest path, which is empty when the graph cannot reach the package.
- Package names are compared exactly. `normalizePackageName` is for advisory matching and is not applied here.

## How to test

`bun test src/reachability` runs every test. The collection tests copy the sample repository into a temporary directory and add excluded directories and symbolic links there, since `.gitignore` drops those directories from the tree. `bun check src/reachability` type-checks the module, and `bunx biome check src/reachability` lints and format-checks it.

## Known gaps

- Call-level reachability is not done. A direct-imported package is reported as imported even when the vulnerable function is never called.
- tsconfig path aliases that look like bare names, such as `utils/format`, are counted as packages. Only `@/`, `~` and `#` aliases are recognized.
- An npm alias dependency is classified under its alias name, the name the code imports, not under its real package name.
- Files that only tests import still count, so a package used only by tests is direct-imported.
- A specifier built at runtime, such as `require(name)`, is not followed.
