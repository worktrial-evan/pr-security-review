## Context

See proposal.md for why and for the decisions taken on open details. The module may import only `src/shared`, so it receives the `DependencySet` and the `DependencyGraph` the lockfile module builds and never parses a lockfile itself.

## Goals / Non-Goals

**Goals:** one scan per run whose result serves every finding, a scan that cannot escape the root or run forever.

**Non-Goals:** module resolution, tsconfig path aliases, call-level reachability, and reading a project's tsconfig.

## Decisions

- **Four source files.** `source-files.ts` walks the root and returns the safe file list. `package-specifier.ts` maps a specifier to a package name. `collect-imports.ts` parses the files and builds the map. `classify-reachability.ts` holds the pure classifier. Each is one concern, so each test file stays focused.
- **Own walker over ts-morph globs.** ts-morph globs through tinyglobby with symbolic links followed. The walker reads each directory with file types, skips symbolic links, prunes excluded directory names before descending, and checks each file's real path against the root's real path. Alternative: Bun.Glob with `followSymlinks: false`, rejected because it still descends into `node_modules` before a filter could drop it.
- **In-memory ts-morph Project.** The Project uses `skipAddingFilesFromTsConfig`, `skipFileDependencyResolution` and an in-memory file system. Each file's text is read with `Bun.file` and added with `createSourceFile`, so ts-morph never touches the disk and never resolves an import.
- **Builtins from `node:module`.** `builtinModules` under Bun lists the Node builtins plus `bun` and the `bun:` modules. A specifier is a builtin when it or its first path segment is in the list, or when it starts with `node:`.
- **Classifier reuses the finding shape.** The result type is `Pick<ScaFinding, 'reachability' | 'importedBy' | 'dependencyPath'>`, so the pipeline spreads it into a finding.
- **Fixture isolation.** The fixture repository lives in `fixtures/sample-repo` and is excluded from the module's TypeScript project. Tests copy it to a temporary directory to add a `node_modules` folder, a `dist` folder and a symbolic link, since `.gitignore` drops those directories and links are fragile in git.

## Risks / Trade-offs

- [A large monorepo still costs a full parse] → the file cap bounds it and the audit event records the count and time.
- [A tsconfig alias that looks like a bare name counts as a package] → listed under Known gaps in AGENTS.md.
- [A package imported only by tests counts as direct-imported] → accepted. Import-level reachability does not separate test files.
