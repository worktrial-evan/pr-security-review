# pr-review

pr-review is a pull request security review agent. Given a pull request it reads the changed files, parses the lockfile diff, matches new dependency versions against the OSV advisory snapshot, decides whether a vulnerable dependency is reachable, scans the added lines for secrets, asks an LLM to review the diff for security issues, summarizes the findings and renders a report, and writes a per-run audit log the whole way through. A benchmark runs recorded cases through the same pipeline and scores them, a harness runs prompt and model experiments against the benchmark, and a CLI and an HTTP server expose all of it. The code is a modular monolith: one Bun process, one repository, nineteen modules under `src/`, and an allowed-imports matrix between them that a boundary check enforces on every commit.

## Modules

One directory per module under `src/`. Each line is the module's purpose.

- `shared`: the data contracts every module builds against
- `audit`: the per-run JSONL audit log with secret redaction
- `run-state`: the ordered review stages and the legal transitions between them
- `pull-request-source`: reads a pull request: changed files, hunks, file contents at base and head, a head checkout
- `lockfile`: parses bun and npm lockfiles into dependency sets and diffs
- `advisories`: fetches and caches the OSV advisory snapshot and serves advisories by package
- `matcher`: matches dependency versions against advisory ranges, handwritten and oracle
- `reachability`: decides whether a vulnerable dependency is directly imported, direct but unused, or transitive
- `secrets`: finds secrets in the lines a pull request adds
- `prompts`: loads versioned, hashed prompt templates
- `llm`: the LLM client with caching, cost accounting and audit events
- `report`: renders findings and metadata into the review report
- `code-review`: LLM code review of the diff for security issues, grounded in evidence
- `summarize`: LLM or template summaries and remediation text for findings
- `pipeline`: runs the review stages end to end and produces the ReviewResult
- `benchmark`: runs benchmark cases through the pipeline and scores them
- `harness`: prompt and model experiments against the benchmark
- `server`: HTTP server exposing review, report and benchmark
- `cli`: the command-line interface

## Allowed imports

`.dependency-cruiser.cjs` is the single source of truth for the allowed-imports matrix. The table below mirrors it, and when the two disagree the config file wins and this table gets fixed. A module may always import itself, Bun and Node built-ins and npm packages. It imports another module only when the matrix grants it. `bun run check:boundaries` fails on any import the matrix does not grant and on any `index.ts` inside a module directory, so there are no barrel files.

| Module | May import |
| --- | --- |
| shared | nothing |
| audit | shared |
| run-state | shared |
| pull-request-source | shared |
| lockfile | shared |
| advisories | shared |
| matcher | shared |
| reachability | shared |
| secrets | shared |
| prompts | shared |
| llm | shared |
| report | shared |
| code-review | shared, llm, prompts |
| summarize | shared, llm, prompts |
| pipeline | shared, audit, run-state, pull-request-source, lockfile, advisories, matcher, reachability, secrets, prompts, llm, report, code-review, summarize |
| benchmark | shared, pipeline, report, pull-request-source |
| harness | shared, benchmark, prompts, llm |
| server | shared, pipeline, report, benchmark |
| cli | shared, pipeline, report, benchmark, harness, server, advisories, matcher, pull-request-source |

Each `src/<module>/tsconfig.json` is a composite TypeScript project whose `references` are that module's row of the matrix, and the root `tsconfig.json` references every module project plus `tsconfig.root-files.json` for `index.ts`, `index.test.ts` and `scripts/`. `bun check` follows those references, so an import the matrix does not grant also fails the type check with TS6307. A change that widens a module's row in `.dependency-cruiser.cjs` updates that module's `references` in the same change. `docs/decisions.md` records the experiment behind this layout.

## Module docs

Every module has an `AGENTS.md` written from `docs/agents-template.md`, with the same eight sections in the same order: Purpose, Public API, Inputs and outputs, Allowed imports, Files, Invariants, How to test, Known gaps. A change that touches a module updates that module's `AGENTS.md` in the same change, so the doc always describes the module as it is now. An empty module still has the file, with "none yet" under the empty sections and "not implemented" under Known gaps.

## Frozen files

These files are edited only by a change whose proposal names them in its Impact section, never by a change that fills in a module:

- `package.json`
- `bun.lock`
- `tsconfig.json`
- `biome.json`
- `.dependency-cruiser.cjs`
- `lefthook.yml`
- `.github/workflows/ci.yml`
- `openspec/config.yaml`
- `src/shared/**`
- `docs/agents-template.md`
- `README.md`

Frozen means a module change does not add or bump a dependency, does not change a compiler or lint option, does not widen the matrix, does not change the hook or CI, does not add or alter a shared contract, does not alter the template and does not rewrite the README. When a module needs one of those, that need becomes its own change that names the file in its Impact section, and the module change builds on it afterwards.

## File headers

Every `.ts` file under `src/`, `scripts/` and `benchmark/` starts with a `//` comment stating what the file does. The comment is on line 1, or on line 2 when line 1 is a shebang. A blank line or a `/* */` block comment does not count. `bun run check:headers` exits non-zero and lists every file that breaks the rule.

## Naming

Never abbreviate pull request in any name: `PullRequest` in types, `pullRequest` in values, `pull-request` in file and module names, and "pull request" in prose. The product name `pr-review` and the repository name `pr-security-review` are the two exceptions and are never renamed.

## Caches and worktrees

Caches live outside the repo: every module that caches (advisories, LLM responses, cloned benchmark repositories) writes under the directory `resolveCacheDirectory()` from `src/shared/cache-directory.ts` returns, which is `PULL_REQUEST_REVIEW_CACHE_DIR` when set and non-empty, else `~/.cache/pull-request-review`. There is no `cache/` directory in the tree and `.gitignore` does not list one, so every worktree shares the one cache. Tests and CI point the variable at a temporary directory.

`.worktreeinclude` at the root lists `.env` and `.env.local`, the gitignored files the desktop app copies into every new worktree.

## Verification

`bun run verify` runs these five checks in this order and stops at the first failure. The pre-commit hook and CI run the same command, so a tree that passes locally passes in CI.

1. `bun check`: the TypeScript check
2. `biome check`: formatting, lint and import order
3. `bun run check:boundaries`: the allowed-imports matrix and the no-barrel-files rule
4. `bun run check:headers`: the file header rule
5. `bun test`: the test suite

Code follows the `code-style` skill under `.agents/skills/code-style/SKILL.md` and git follows the `git-discipline` skill under `.agents/skills/git-discipline/SKILL.md`.

## Git rules

- Never push. The user pushes.
- Never merge.
- Never archive a change on your own. The user archives a change when they consider it finished.
- One commit per change, made only after the user archives it. Nothing is committed while a change is being built: finished files are staged as they are finished, and the single commit holds the implementation, the planning artifacts and the archived change together.
