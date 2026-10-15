# Tasks

## 1. Reference and GitHub API

- [x] 1.1 Write `pull-request-reference.ts` and its test covering the full URL, the short form and the three rejected inputs, and verify `bun test src/pull-request-source/pull-request-reference.test.ts` passes
- [x] 1.2 Record a public pull request response into `test/fixtures/pull-request-source/github/`, write `github-api.ts` and its test covering no token, a token, a rate limit and a 404, and verify `bun test src/pull-request-source/github-api.test.ts` passes

## 2. Diff building blocks

- [x] 2.1 Write `unified-diff.ts` and its test parsing a two-hunk diff with a removed line, a no-newline marker and an empty-side header, and verify `bun test src/pull-request-source/unified-diff.test.ts` passes
- [x] 2.2 Write `line-diff.ts` in under 150 lines and its test covering one modified line with context, merged and split hunks, a new file and a missing final newline, and verify `bun test src/pull-request-source/line-diff.test.ts` passes and `wc -l` is under 150

## 3. Sources

- [x] 3.1 Write `snapshot-pull-request-source.ts`, add the base and head fixture under `test/fixtures/pull-request-source/snapshot/` with added, modified, deleted, renamed, moved-and-edited and binary files, and a test asserting each file's status, hunks and added lines plus base and head reads, and verify `bun test src/pull-request-source/snapshot-pull-request-source.test.ts` passes
- [x] 3.2 Write `git-pull-request-source.ts` and its test over a temp repository built in the test, covering statuses, added lines, reads at both shas, and checkout then dispose, and verify `bun test src/pull-request-source/git-pull-request-source.test.ts` passes
- [x] 3.3 Write `equivalence.test.ts` committing the snapshot fixture as two commits and asserting both sources return deep-equal changed files, and verify `bun test src/pull-request-source/equivalence.test.ts` passes
- [x] 3.4 Write `clone-pull-request.ts` and its test cloning from a local bare repository with a `refs/pull/1/head` ref and a stubbed API, covering the first clone and the cached reuse, and verify `bun test src/pull-request-source/clone-pull-request.test.ts` passes

## 4. Finish

- [x] 4.1 bun run verify passes
- [x] 4.2 module AGENTS.md updated: Public API, Files, Invariants, How to test, Known gaps, and the no-token and token paths, verified by reading it against `ls src/pull-request-source`
