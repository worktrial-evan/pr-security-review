## 1. Specifier mapping

- [x] 1.1 Add `package-specifier.ts` mapping a specifier to its package name, with tests for scoped, subpath, builtin, `node:`, `bun:`, relative and alias specifiers. Verify with `bun test src/reachability/package-specifier.test.ts`

## 2. Fixture repository

- [x] 2.1 Add `fixtures/sample-repo` with every import form across the eight extensions, a subpath import, a scoped package, a dynamic import, a require, type-only imports and computed specifiers, plus `fixtures/sample-dependencies.ts` with a dependency set holding an unused direct dependency and a transitive dependency and a graph over it. Exclude `fixtures/sample-repo` in the module `tsconfig.json`. Verify with `bun check src/reachability` and `bunx biome check src/reachability`

## 3. Import collection

- [x] 3.1 Add `source-files.ts`, the walker that prunes excluded directories, skips symbolic links, keeps real paths inside the root and stops at the file cap. Verify through the collection tests in 3.2
- [x] 3.2 Add `collect-imports.ts` with the in-memory ts-morph Project, the import map, the warnings and the audit event, with tests over a temporary copy of the fixture: every form found, excluded directories and a symbolic link ignored, the cap warning and the audit payload. Verify with `bun test src/reachability/collect-imports.test.ts`

## 4. Classification

- [x] 4.1 Add `classify-reachability.ts` with tests for direct-imported, direct-unused and transitive using one scan of the fixture reused across every case. Verify with `bun test src/reachability/classify-reachability.test.ts`

## 5. Wrap-up

- [x] 5.1 bun run verify passes. Verify with `bun run verify`
- [x] 5.2 module AGENTS.md updated: every section filled, with import-level reachability stated and call-level reachability listed as a known gap. Verify by reading `src/reachability/AGENTS.md` against the files in the module
