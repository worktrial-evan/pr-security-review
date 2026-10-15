# Proposal

## Why

Nothing in the repository can say whether a prompt or model change made the reviewer better or worse. This change builds the measurement first: a labeled corpus of pull request cases, a scorer with explicit matching rules, and a runner that executes any `ReviewPipeline` over the corpus and writes results, all before any detector is tuned against it.

## What Changes

- Add `benchmark/fixtures/app`, a small Bun web app with a sqlite query, a file download route, a login that issues a JWT, an admin route, a template render, a redirect, a shell-out and an upload directory. It ships a `bun.lock` and a `package-lock.json` that resolve the same dependency tree, and every package in that tree has its advisories in `benchmark/fixtures/advisories`.
- Add `benchmark/fixtures/advisories`, a pinned advisory snapshot in the shared `Advisory` shape: the real OSV advisories for every package the fixture app and the real-world cases use, plus a handful of synthetic advisories with ids prefixed `PRR-TEST-` for the shapes the corpus needs that real data does not give deterministically (a last-affected-only range, a versions-only listing, a withdrawn advisory, an advisory GitHub did not review).
- Add `benchmark/cases`, 54 cases, each a directory named by id with a `case.json` and, for synthetic cases, full `base/` and `head/` copies of the modified fixture app: 12 dependency, 15 code, 4 secrets, 15 clean and 8 real-world git cases where the base is an advisory's fix commit and the head is its parent. Every case records its split, about 70 percent dev and 30 percent test within each category.
- Add `src/benchmark`: a case loader and corpus validator, a pure scorer, a snapshot and a git `PullRequestSource`, a runner, a results page renderer, and a `validate` entry that `bun run benchmark:validate` runs to print counts by category and split.
- Add `docs/benchmark.md`, the plain-language explanation of every matching rule, where the labels come from and what a score means.
- Add `benchmark/biome.json`, a nested config that turns the linter off under `benchmark/` so a case that deliberately calls `eval` or builds a query by concatenation is not a lint failure. The formatter stays on.

Open points settled the simplest way:

- The `pull-request-source` and `report` modules are empty at this change's base. The benchmark ships its own snapshot and git sources behind the shared `PullRequestSource` interface and renders its results page with template strings. When those modules land, the benchmark swaps to them in a later change.
- `falsePositivesOnClean` counts the false positives on every case whose `isClean` is true, whatever its category, so a dependency case that expects nothing (a withdrawn advisory, a bump to a fixed version) counts there too.
- A dependency case for an advisory GitHub did not review expects the finding. Whether the reviewer downgrades it is a detector decision the scorer does not see.
- A real-world expected finding carries the file and line range of the lines the reversed fix adds, so the code-review line rule applies to it like to any synthetic case.
- The advisory fixture is the shared `Advisory` schema serialized to one JSON file plus a `snapshot.json` in the `AdvisorySnapshot` shape. The advisories module reads its cache its own way when it lands; the runner only passes the fixture directory as `advisoryCacheDir`.

## Capabilities

### New Capabilities

- `benchmark-corpus`: the layout and labeling of benchmark cases, the fixture app they derive from, the dev and test split, and the validation that every case is well formed.
- `benchmark-scoring`: the rules that decide when a predicted finding matches an expected one, the exclusion of pre-existing findings, and the metrics a benchmark run reports.
- `benchmark-runner`: running any review pipeline over the corpus offline against the pinned advisory fixture, the results files and page it writes, and the real-world cases it clones or skips.

### Modified Capabilities

None.

## Impact

- New module code in `src/benchmark`, with its `AGENTS.md` filled in.
- New trees `benchmark/cases`, `benchmark/fixtures/app`, `benchmark/fixtures/advisories` and `benchmark/results` (a `.gitkeep` until a run writes there), plus `benchmark/biome.json`.
- New `docs/benchmark.md`.
- `package.json` gains one script line, `benchmark:validate`. No dependency is added or changed and no other frozen file is touched.
- Real-world cases clone into `benchmark-repos` under the shared cache directory on first run and are skipped with a warning offline. Nothing is written inside the repository by a run except under `benchmark/results`.
- Out of scope: running the real pipeline and any tuning. The tests run the runner against a stub pipeline.
