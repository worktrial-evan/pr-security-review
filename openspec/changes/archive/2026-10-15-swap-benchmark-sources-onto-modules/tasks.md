# Tasks

## 1. Snapshot source

- [x] 1.1 Replace the benchmark's snapshot source with `@/pull-request-source/snapshot-pull-request-source` in `case-source.ts` and `corpus-validation.ts`, delete `snapshot-pull-request-source.ts`, `unified-diff.ts` and their tests, and verify `bun test src/benchmark/case-source.test.ts src/benchmark/corpus-validation.test.ts` passes and `bun run benchmark:validate` still reports 54 cases

## 2. Git source

- [x] 2.1 Write `benchmark-repository.ts` per design D1 with `openBenchmarkRepository`, `OfflineCloneError`, `offlineEnvironmentVariable` and `isGitSourceOffline` on the module's `runGit`, returning the module's `GitPullRequestSource`, and its test over a local two-commit repository covering the changed files, the clone path, clone reuse, the offline error, an unreachable url leaving no directory and a missing sha, and verify `bun test src/benchmark/benchmark-repository.test.ts` passes
- [x] 2.2 Point `case-source.ts`, `run.ts` and the tests at `benchmark-repository.ts` and the module's `runGit`, delete `git-pull-request-source.ts`, `git-environment.ts` and their tests, and verify `bun test src/benchmark` passes with `GIT_DIR` pointed at this worktree's gitdir

## 3. Results page

- [x] 3.1 Rebuild `results-page.ts` on the report module's `escapeHtml`, `pageStyle`, `formatCostUsd` and `emptyValueText` per design D3, and verify `bun test src/benchmark/results-page.test.ts src/benchmark/run.test.ts` passes

## 4. Final verification

- [x] 4.1 bun run verify passes
- [x] 4.2 module AGENTS.md updated
