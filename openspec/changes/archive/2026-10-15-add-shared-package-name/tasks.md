# Tasks

## 1. Shared rule

- [x] 1.1 Add `src/shared/package-name.ts` with `normalizePackageName` and `src/shared/package-name.test.ts` covering case, whitespace, scoped names and an already normalized name, and verify `bun test src/shared/package-name.test.ts` passes

## 2. Advisories

- [x] 2.1 Import `normalizePackageName` from `@/shared/package-name` in `src/advisories`, delete the local copy, move its test to shared, and verify `bun test src/advisories` passes and `grep -rn "function normalizePackageName" src` finds only the shared one

## 3. Wrap-up

- [x] 3.1 bun run verify passes
- [x] 3.2 module AGENTS.md updated: verify `src/shared/AGENTS.md` and `src/advisories/AGENTS.md` both name the new file
