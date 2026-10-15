# Design

## Context

See proposal.md for the motivation and specs/pull-request-source/spec.md for the behavior. The module implements `PullRequestSource` from `src/shared/pull-request-source.ts` unchanged and may import only `shared`, Bun and Node built-ins and npm packages. zod is already a dependency.

## Goals / Non-Goals

**Goals:**

- Git and snapshot output that is deep-equal for the same trees, so a benchmark snapshot reviews exactly like the git history it came from.
- Tests that run offline, with no token and no GitHub access.

**Non-Goals:**

- Rename detection for moved and edited files.
- Submodules, symlinks as links, and file mode changes. A mode-only change is not listed.

## Decisions

### D1. Files and classes

- `pull-request-reference.ts`: `parsePullRequestReference` and `InvalidPullRequestReferenceError`.
- `github-api.ts`: `fetchPullRequestShas`, `GitHubRateLimitError`, `GitHubRequestError`. The response is parsed with a module-local zod schema.
- `unified-diff.ts`: `parseUnifiedDiffHunks` turns git's diff text into `Hunk[]`, and `collectAddedLines` turns hunks into `AddedLine[]`. Both sources use `collectAddedLines`.
- `line-diff.ts`: the LCS line diff and the hunk builder for snapshots, under 150 lines.
- `git-command.ts`: `runGit` and `GitCommandError`, shared by the git source and the clone.
- `changed-file.ts`: `createChangedFile`, `sortChangedFiles` and `comparePaths`, shared by both sources so their output has one shape and one order.
- `git-pull-request-source.ts`: `GitPullRequestSource` class.
- `clone-pull-request.ts`: `clonePullRequest`.
- `test-git-repository.ts`: `createTwoCommitRepository`, which the git, equivalence and clone tests build their repositories with.
- `snapshot-pull-request-source.ts`: `SnapshotPullRequestSource` class.

Classes match the brief's `GitPullRequestSource({ ... })` shape and hold the worktree path between `checkoutHead` and `dispose`.

### D2. Git commands are pinned against user config

Every git call drops the repository variables `git rev-parse --local-env-vars` lists, such as `GIT_DIR` and `GIT_INDEX_FILE`. A git hook exports them for its own repository, and `GIT_DIR` overrides `-C`, so without this a run inside the pre-commit hook acts on the wrong repository. Every git call runs `git -C <repo> -c core.quotepath=false` with `--no-color --no-ext-diff --no-textconv --diff-algorithm=myers --minimal`, so a user's `diff.algorithm`, `diff.renames` or `color.ui` setting cannot change the output. The file list comes from `git diff --name-status -z -M100%`: `-z` keeps unusual paths intact and `-M100%` reports exact renames only. A type change `T` maps to modified. Binary files come from `git diff --numstat -z`, where git prints `-` for both counts. Added lines come from `git diff --unified=0` per file, and hunks from a second `git diff --unified=<contextLines>` per file, as the brief asks. A per-file call avoids parsing quoted paths out of a combined diff.

### D3. The snapshot diff reproduces git's hunk rules

- Lines are split on `\n` and compared with their terminator, so a missing final newline differs from a present one, as in git. Hunk text drops the terminator.
- The LCS table is built over the two line arrays and walked back into an edit script. Within each run of changes, removed lines are emitted before added lines, as git prints them.
- Changes merge into one hunk when the unchanged gap between them is at most twice the context count, which is git's rule.
- A hunk side with zero lines starts at the line before it, as in git's header: a new file is `-0,0 +1,n`.
- A file is binary when either side has a NUL byte in its first 8000 bytes, git's own test.
- Renames: a deleted path and an added path with byte-identical content pair into one renamed file. With several identical candidates, paths pair in sorted order.

The LCS table is quadratic in lines. Benchmark snapshots are small, so this is accepted.

### D4. Tokens never touch disk or argv

`fetchPullRequestShas` sends `Authorization: Bearer <token>` only when the token is a non-empty string. `clonePullRequest` passes a token to git through `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and `GIT_CONFIG_VALUE_0` as `http.https://github.com/.extraheader` with `Basic base64(x-access-token:<token>)`. The key is scoped to github.com, so a `remoteUrl` on another host never receives the token. That keeps the token out of the clone URL, out of `.git/config` and out of the process list. `GIT_TERMINAL_PROMPT=0` makes a private repository without a token fail instead of waiting for a password.

### D5. Rate limit detection

A response is a rate limit when the status is 403 or 429 and either `x-ratelimit-remaining` is `0` or the body message mentions a rate limit. That covers the primary and the secondary limit. Every other non-success status is a `GitHubRequestError` with the status and the body message.

### D6. Clone layout

The repository lives at `<cacheDir>/<owner>/<repo>` as a bare repository, since nothing reads its working tree. When absent it is created with `git clone --bare --depth=1`, and its `HEAD` file marks it present. Then `git fetch --depth=1 origin <baseSha> +refs/pull/<n>/head:refs/pull-request/<n>` brings both commits. GitHub serves a fetch by sha. The head sha from the API must then exist locally, or the call fails naming the sha. `remoteUrl` defaults to `https://github.com/<owner>/<repo>.git`.

### D7. Head checkout

`checkoutHead` runs `git worktree add --detach <temp dir> <headSha>` under the system temp directory once, and returns the same path afterwards. `dispose` runs `git worktree remove --force` and then removes the directory if it is still there. The snapshot source returns `headDir` and its `dispose` does nothing.

### D8. Fixtures and tests

Fixtures live in `test/fixtures/pull-request-source/`, outside the TypeScript project and the header roots. Snapshot files are `.txt` so Biome does not lint them. The recorded API response is a real public pull request response trimmed to the fields the module reads, plus a rate limit body. Tests stub `globalThis.fetch` with `spyOn`, and build git repositories in a temp directory with `Bun.$`.

## Risks / Trade-offs

- [Git's Myers diff and the LCS diff can choose different but equally short edit scripts on ambiguous input] → `--minimal` keeps git's script minimal, the equivalence fixture avoids repeated ambiguous lines, and AGENTS.md lists the gap.
- [Exact-only renames show a moved and edited file as delete plus add] → Both sources agree, which the equivalence requirement needs. A later change can add similarity renames to both.
- [A cached clone shared across worktrees can race when two runs fetch at once] → git's own ref locking fails one fetch cleanly. Not pre-empted now.
