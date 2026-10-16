# Module imports

The module flowchart in the [README](../../README.md#architecture) is drawn from this list. It records which module imports which in the code as it is, not what [.dependency-cruiser.cjs](../../.dependency-cruiser.cjs) allows. The matrix grants more than the code uses.

Recorded on 2026-10-15 at commit `795f30d`.

## The command

```bash
bunx depcruise src index.ts --config .dependency-cruiser.cjs --collapse '^src/[^/]+' --exclude '(\.test\.ts$|/fixtures/)' --output-type text | grep -E '→ src/' | sort -u
```

`--collapse` folds every file into its module directory. `--exclude` leaves out test files and fixture directories, so the list shows the imports a review runs through. The reachability fixtures would otherwise add made-up package names. The `grep` keeps only edges that land on a module.

## Production edges

| From | To |
| --- | --- |
| `index.ts` | cli |
| advisories | shared |
| audit | shared |
| benchmark | pull-request-source, report, shared |
| cli | advisories, benchmark, pipeline, pull-request-source, report, shared |
| code-review | llm, prompts, shared |
| llm | shared |
| lockfile | shared |
| matcher | shared |
| pipeline | advisories, audit, code-review, llm, lockfile, matcher, reachability, run-state, secrets, shared, summarize |
| prompts | shared |
| pull-request-source | shared |
| reachability | shared |
| report | shared |
| run-state | shared |
| secrets | shared |
| summarize | prompts, shared |

`harness` and `server` hold no code, so they import nothing and nothing imports them.

## Edges only tests add

Running the same command without `--exclude` adds three edges, each from a test file:

- cli to matcher
- pipeline to pull-request-source
- summarize to llm

## Edges the matrix allows that the code does not use

The matrix grants these and no production file uses them: cli to harness, server and matcher; pipeline to pull-request-source, prompts and report; benchmark to pipeline; summarize to llm; harness to anything; server to anything. The pipeline reaches the pull request through the `PullRequestSource` interface in [src/shared/pull-request-source.ts](../../src/shared/pull-request-source.ts), and the benchmark takes the pipeline as a `ReviewPipeline` function from [src/shared/review.ts](../../src/shared/review.ts), so neither needs the module itself.

## Checking the boundary

`bunx depcruise src index.ts --config .dependency-cruiser.cjs --output-type err` printed `no dependency violations found (319 modules, 1153 dependencies cruised)` on the same commit. `bun run check:boundaries` runs the same rules through [scripts/check-boundaries.ts](../../scripts/check-boundaries.ts).
