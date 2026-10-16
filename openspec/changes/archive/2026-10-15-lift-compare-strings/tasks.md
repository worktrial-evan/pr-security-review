# Tasks

## 1. Shared comparator

- [x] 1.1 Add `src/shared/compare-strings.ts` with `compareStrings({ first, second })` and `CompareStringsOptions`, and `src/shared/compare-strings.test.ts` covering equal strings, the order of two strings, uppercase before lowercase, `CWE-1321` before `CWE-20`, a prefix first and a non-ASCII letter after `z`. Verify with `bun test src/shared/compare-strings.test.ts`

## 2. Callers

- [x] 2.1 Import `compareStrings` from `@/shared/compare-strings` in `src/lockfile/sorted-dependency-versions.ts` and delete its local copy. Verify with `bun test src/lockfile`
- [x] 2.2 Replace `comparePaths` in `src/pull-request-source/changed-file.ts` and `snapshot-pull-request-source.ts` with the shared function, sorting every file list through one `sortFilesByPath`. Verify with `bun test src/pull-request-source`
- [x] 2.3 Import the shared function in `src/code-review/review-packet.ts` and `dedupe-findings.ts`, delete `src/code-review/compare-strings.ts` and its test. Verify with `bun test src/code-review` and `grep -rn "function compareStrings\|function comparePaths" src` finding only the shared one

## 3. Wrap-up

- [x] 3.1 bun run verify passes
- [x] 3.2 module AGENTS.md updated: `src/shared/AGENTS.md` names the new file under Public API, Files and Invariants, and `src/lockfile/AGENTS.md`, `src/pull-request-source/AGENTS.md` and `src/code-review/AGENTS.md` no longer name a local comparator. Verify by reading each file against `docs/agents-template.md`
