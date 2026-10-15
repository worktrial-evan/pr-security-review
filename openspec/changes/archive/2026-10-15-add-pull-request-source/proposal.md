# Proposal

## Why

The pipeline and the benchmark both need a pull request as changed files, hunks, added lines and file contents, and today `src/pull-request-source` is empty. One implementation of the shared `PullRequestSource` contract per origin lets every detector read a GitHub pull request, a local repository and a benchmark snapshot the same way.

## What Changes

- `parsePullRequestReference` turns a GitHub pull request URL or `owner/repo#123` into a `PullRequestReference`.
- `fetchPullRequestShas` reads the base sha, head sha, title, author and URL from the GitHub REST API, with or without a token. A rate-limited response becomes a typed error that names `GITHUB_TOKEN`.
- `GitPullRequestSource` reads two shas of a local repository through the git command line, and checks out the head into a temporary worktree.
- `clonePullRequest` shallow-clones a GitHub repository into a cache directory, fetches the pull request head and base, and returns a `GitPullRequestSource`.
- `SnapshotPullRequestSource` compares two directory trees with its own line diff and returns the same `ChangedFile` shape as the git source.

Choices taken where the brief left a detail open:

- A removed hunk line has `headLine` 0, because it has no line in the head revision.
- Both sources treat a rename as an exact rename only: a file moved with identical content. A moved file that was also edited is a deleted file plus an added file, so both sources always agree.
- Hunks carry 3 lines of context unless the caller passes `contextLines`.
- A snapshot's `describe` returns `snapshot:` followed by the absolute directory path as each sha, because a directory has no commit.
- `clonePullRequest` takes `cacheDir` from the caller. The caller passes a directory under `resolveCacheDirectory()`.
- `clonePullRequest` takes an optional `remoteUrl`, so the test can clone a local repository without network access.
- A token reaches git through environment configuration, never through the clone URL or the command arguments, so it is never written to the cached repository's config.

Out of scope: posting anything back to GitHub.

## Capabilities

### New Capabilities

- `pull-request-source`: reading a pull request from GitHub, a local repository or two directory snapshots into changed files, hunks, added lines, file contents and a head checkout.

### Modified Capabilities

None.

## Impact

- New code, tests and `AGENTS.md` in `src/pull-request-source`.
- New fixtures in `test/fixtures/pull-request-source`: a recorded GitHub API response and a base and head snapshot pair.
- No frozen file changes. No new dependency and no shared contract change: the module implements `src/shared/pull-request-source.ts` as it is.
- Network access only in `fetchPullRequestShas` and `clonePullRequest`. The tests run offline.
