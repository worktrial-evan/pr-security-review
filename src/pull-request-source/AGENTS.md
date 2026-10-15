# pull-request-source module

## Purpose

Reads a pull request from a GitHub pull request, a local repository with two shas, or two directory snapshots into the shared `PullRequestSource` contract, so the pipeline and the benchmark read every pull request the same way.

## Public API

### pull-request-reference.ts

- `parsePullRequestReference(text)`: parses `https://github.com/owner/repo/pull/123` or `owner/repo#123` into a `PullRequestReference` with the canonical URL
- `InvalidPullRequestReferenceError`: thrown for any other text, holding the text

### github-api.ts

- `fetchPullRequestShas({ reference, token })`: reads baseSha, headSha, title, author and htmlUrl from the GitHub REST API
- `FetchPullRequestShasOptions`, `PullRequestShas`: its options and result
- `GitHubRateLimitError`: thrown for a 403 or 429 rate limit response. Its message names `GITHUB_TOKEN` as the fix
- `GitHubRequestError`: thrown for any other non-success response, holding the status

### git-pull-request-source.ts

- `GitPullRequestSource`: a `PullRequestSource` over `{ repoPath, baseSha, headSha }` of a local repository, with optional `contextLines` and `pullRequestReference`
- `GitPullRequestSourceOptions`: its options

### clone-pull-request.ts

- `clonePullRequest({ reference, cacheDir, token })`: shallow-clones the repository under `cacheDir` when absent, fetches the base sha and `refs/pull/<n>/head`, and returns a `GitPullRequestSource`. Optional `contextLines`, and `remoteUrl` for tests
- `ClonePullRequestOptions`: its options

### snapshot-pull-request-source.ts

- `SnapshotPullRequestSource`: a `PullRequestSource` over `{ baseDir, headDir }`, with optional `contextLines`
- `SnapshotPullRequestSourceOptions`: its options

### Internal to the module

- `git-command.ts`: `runGit` and `GitCommandError`
- `changed-file.ts`: `createChangedFile`, `sortChangedFiles` and `comparePaths`
- `unified-diff.ts`: `parseUnifiedDiffHunks` and `collectAddedLines`
- `line-diff.ts`: `buildLineDiffHunks`
- `test-git-repository.ts`: `createTwoCommitRepository`, for tests only

## Inputs and outputs

Reads a pull request reference, the GitHub REST API, a local git repository through the `git` command line, or two directories. Produces the shared contracts from `src/shared/pull-request-source.ts`: `PullRequestReference`, `PullRequestDescription` and `ChangedFile` with its `Hunk` and `AddedLine` values. `addedLines` is the head line number and text of every added or modified line, the lines secrets and code review treat as introduced by the pull request.

### No-token path

Public repositories need no token. `fetchPullRequestShas` sends no Authorization header when the token is undefined or empty, which allows 60 API requests an hour per IP address. `clonePullRequest` clones over anonymous HTTPS. When the API limit runs out, the call throws `GitHubRateLimitError`, whose message tells the user to set `GITHUB_TOKEN`. A private repository without a token fails with GitHub's 404 as a `GitHubRequestError`. Git never prompts for a password, because every git call sets `GIT_TERMINAL_PROMPT=0`.

### Token path

The caller reads `GITHUB_TOKEN` and passes it as `token`. `fetchPullRequestShas` sends it as `Authorization: Bearer <token>`. `clonePullRequest` passes it to git as an `http.https://github.com/.extraheader` entry through `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0`. The token is never in the clone URL, the git arguments or the cached repository's config, and it is only sent to github.com.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `pull-request-reference.ts`: reference parsing and its error
- `pull-request-reference.test.ts`: the full URL, the short form, a trailing slash, and four rejected inputs
- `github-api.ts`: the GitHub REST API call and its two errors
- `github-api.test.ts`: the recorded response with no token, an empty token and a token, a rate limited 403, and a 404
- `git-command.ts`: runs git with `core.quotepath=false`, literal pathspecs, no terminal prompt, and without the repository variables a git hook exports
- `git-command.test.ts`: a command targets its own repository while `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` point at another, and a failure throws `GitCommandError` with git's stderr
- `changed-file.ts`: builds changed files without an undefined previousPath and sorts them by path
- `unified-diff.ts`: parses git's unified diff text into hunks and collects added lines from hunks
- `unified-diff.test.ts`: two hunks with a removed line that looks like a file header, a no-newline marker, an empty old side, and added line collection
- `line-diff.ts`: the longest common subsequence line diff and git's hunk rules, under 150 lines
- `line-diff.test.ts`: one modified line with context, merged and split hunks, a new file, a missing final newline, identical texts, and five cases compared against `git diff --no-index`
- `git-pull-request-source.ts`: the git source
- `git-pull-request-source.test.ts`: statuses, added lines and hunks, the same output under hostile repository diff config, reads at both shas, describe, and checkout then dispose
- `clone-pull-request.ts`: the clone into the cache and the token environment
- `clone-pull-request.test.ts`: a shallow bare clone from a local remote with no token, then reuse of the cached clone for a second pull request with a token kept off disk
- `snapshot-pull-request-source.ts`: the snapshot source
- `snapshot-pull-request-source.test.ts`: statuses, split hunks, added lines, an added and a deleted file, an exact rename and a binary file, reads, a path leaving the tree, checkout and describe
- `equivalence.test.ts`: the snapshot fixture committed as two commits gives deep-equal changed files through both sources at 0, 1, 3 and 5 lines of context, and the same file text at base and head
- `test-git-repository.ts`: builds a temporary repository with a base commit and a head commit from two directories
- `tsconfig.json`: the module's composite TypeScript project. It references shared only
- `AGENTS.md`: this file

The fixtures live in `test/fixtures/pull-request-source/`: `github/` holds the recorded public pull request response and a rate limit body, and `snapshot/` holds a base tree and a head tree.

## Invariants

- The git source and the snapshot source return deep-equal changed files for the same trees. A change to either one's diff rules changes both, and `equivalence.test.ts` checks it.
- Changed files are sorted by path, comparing code units.
- A rename is an exact rename only: a file moved with identical bytes. A moved and edited file is a deleted file plus an added file.
- A removed hunk line has `headLine` 0. Context and added lines have their head line number.
- Within a run of changes, removed lines come before added lines, and changes merge into one hunk when at most twice the context count of unchanged lines lie between them.
- A file is binary when either side has a NUL byte in its first 8000 bytes. A binary file has no hunks and no added lines.
- Every git command acts on the repository it is given. The repository variables that `git rev-parse --local-env-vars` lists, such as `GIT_DIR`, are dropped, so the module works when it runs inside a git hook.
- Git output does not depend on the user's git config: color, external diff tools, text conversion, the diff algorithm, rename settings and path quoting are fixed on every call.
- A token never reaches disk, git's arguments, or a host other than github.com.
- `checkoutHead` on the git source creates one worktree per source, and `dispose` removes it. The snapshot source's checkout is `headDir`, and its `dispose` does nothing.

## How to test

`bun test src/pull-request-source` runs every test offline: fetch is stubbed, and every repository and remote is built in a temporary directory. `bun check src/pull-request-source` type-checks the module and `bunx biome check src/pull-request-source` lints it.

## Known gaps

- Renames are exact only, so a moved and edited file shows as a deletion and an addition.
- Git's Myers diff and the longest common subsequence diff can choose different but equally short edit scripts on input with many repeated lines. The two sources then disagree on hunk layout, though both are minimal.
- The snapshot diff is quadratic in the line count of a file, which suits benchmark snapshots but not very large files.
- A snapshot's `describe` returns `snapshot:` plus the directory path as each sha.
- File mode changes, submodules and symlinks as links are not reported. A mode-only change is left out of the git source's list.
- `clonePullRequest` does not lock the cache, so two runs fetching the same repository at once can fail one fetch.
- Text is decoded as UTF-8.
