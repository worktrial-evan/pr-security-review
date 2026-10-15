# Proposal

## Why

`add-benchmark-corpus-and-scorer` was built while `pull-request-source` and `report` were empty, so the benchmark ships its own diff parser, snapshot source, git source, git wrapper and page helpers. Both modules have landed since, and two copies of the diff rules will drift apart. This change removes the stand-ins and builds the benchmark on the modules, as the earlier proposal promised.

## What Changes

- Use the `pull-request-source` module's `SnapshotPullRequestSource` for snapshot cases, in the runner and in the corpus validator, and delete the benchmark's `snapshot-pull-request-source.ts` and `unified-diff.ts` with their tests.
- Keep the benchmark's clone cache and offline skip, but rebuild them on the module's `runGit` and return the module's `GitPullRequestSource` over the clone. The benchmark's own git source class and its hook-safe environment helper go.
- Build the results page on the `report` module's `escapeHtml`, `pageStyle` and value formats, keeping only the benchmark-specific metrics and case tables and their filter here.
- Update `src/benchmark/AGENTS.md`.

No spec-level behavior changes: every requirement of `benchmark-runner` and `benchmark-corpus` holds as written, so this change sets `skip_specs`. Two observable details move with the module and are recorded here: a snapshot source now describes its revisions as `snapshot:<directory>` instead of `base` and `head`, and hunks carry the module's three lines of context while added lines stay exact.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None.

## Impact

- Only `src/benchmark/**` changes. `benchmark/cases` and the fixtures stay as they are, and `bun run benchmark:validate` must report the same 54 cases after the swap, so the module's line diff agrees with every label the corpus carries.
- The benchmark now imports `pull-request-source` and `report`, both already granted by the allowed-imports matrix and by the module's `tsconfig.json` references. No frozen file changes.
