# Tasks

## 1. Lockfile

- [x] 1.1 Add the npm fixture `src/lockfile/fixtures/npm/case-variant-names` installing `JSONStream` and `jsonstream`, and a test in `src/lockfile/lockfile-registry.test.ts` asserting both names stay separate with their own versions, and verify `bun test src/lockfile/lockfile-registry.test.ts` passes

## 2. Docs

- [x] 2.1 Reword the header comment of `src/shared/package-name.ts` and its entries in `src/shared/AGENTS.md` to say names are normalized for matching against advisory data, and verify `grep -n "normalizePackageName" src/shared/AGENTS.md` shows the new wording

## 3. Wrap-up

- [x] 3.1 bun run verify passes
- [x] 3.2 module AGENTS.md updated: verify `src/lockfile/AGENTS.md` states that names stay exact and lists the new fixture
