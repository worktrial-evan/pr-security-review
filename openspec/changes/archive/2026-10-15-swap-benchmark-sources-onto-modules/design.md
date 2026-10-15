# Design

## Context

See proposal.md. The module's `SnapshotPullRequestSource` takes `{ baseDir, headDir }` and diffs the trees with its own line diff, its `GitPullRequestSource` takes `{ repoPath, baseSha, headSha }` over a local repository, and `runGit({ repoPath, gitArguments })` throws a `GitCommandError` holding git's stderr and already drops the variables a git hook exports. `clonePullRequest` in that module is GitHub-specific: it resolves a pull request reference through the API, which a benchmark case with two shas and a clone url does not need.

## Goals / Non-Goals

**Goals:** one diff engine, one git wrapper and one html escaper across the repository, with the benchmark keeping its clone cache, offline skip and page layout.

**Non-Goals:** changing any case, label or results file field. Rendering the benchmark page through `renderHtmlReport`, which takes a `ReviewResult` and has nothing to show for a per-case score table.

## Decisions

### D1. The clone cache stays in the benchmark, on the module's git wrapper

`src/benchmark/benchmark-repository.ts` replaces `git-pull-request-source.ts`: `openBenchmarkRepository({ repoUrl, baseSha, headSha, cacheDirectory })` clones once under `<cache>/benchmark-repos/<host>/<owner>/<repo>` with `--no-checkout`, fetches when a sha is missing, classifies a network failure as `OfflineCloneError`, and returns the module's `GitPullRequestSource` over the clone. Every git call goes through the module's `runGit`, with `GitCommandError.stderr` feeding the network failure patterns. `git-environment.ts` is deleted: `runGit` already strips the hook variables, and the tests build their repositories through it too.

### D2. The validator diffs through the module's snapshot source

`corpus-validation.ts` keeps its rule that every labeled line range sits inside the lines the head adds, now reading `addedLines` from the module's source. The module computes added lines from a longest common subsequence diff, so a case whose label sat on lines only `git diff --no-index` called added would fail validation. The expectation is that none does, and the validator run proves it.

### D3. The page keeps its own tables

`results-page.ts` imports `escapeHtml` and `renderLink` from `@/report/html-escape`, `pageStyle` from `@/report/page-style` and `formatCostUsd` plus `emptyValueText` from `@/report/report-format`, and appends the few rules its own tables need. Its filter stays a three-select script over data attributes, since `selectRows` filters finding columns.

## Risks / Trade-offs

- [A label the module's diff does not count as added] → the validator names the case and the label is corrected, never the diff.
- [`runGit` adds `--literal-pathspecs` and `core.quotepath=false` to every call] → harmless for clone, fetch, cat-file and rev-parse.
