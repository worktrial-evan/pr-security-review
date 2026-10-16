# Design

## Context

See proposal.md for motivation. The code is a modular monolith with nineteen modules and zod contracts in `src/shared`. Names cross modules through those contracts, so a contract rename breaks every user, and `bun check` lists each break. JSON data (`case.json`, fixtures, recorded results) is parsed by the schemas, so the schema tests catch stale keys. A sweep of the tree shows the old words in about 20 modules plus `benchmark/`, `test/fixtures/`, `scripts/` and `docs/`. The archived changes under `openspec/changes/archive` are history and stay as written.

## Goals / Non-Goals

**Goals:**
- Replace each abbreviation with its full word everywhere the brief lists, with no behavior change
- Leave the tree green after every group, so a failure points at one word

**Non-Goals:**
- Renaming kept names, listed in the proposal
- Changing `README.md`, `openspec/config.yaml`, `.dependency-cruiser.cjs` or archived changes

## Decisions

**One group per old word, contracts first.** Each group renames the shared contract, then fixes the uses `bun check` lists, then the data and docs that use the word, then runs `bun check` and `bun test`. The alternative, one module at a time, would touch each file several times and leave contracts half renamed between modules.

**Word-bounded, case-aware search, applied by hand per group.** A blind global replace would hit `report`, `directory`, `reportable`, the split value `dev`, `devDependencies` and the severity `info`. Each group lists its patterns, reviews the matches and renames them with a scripted replace on the reviewed set. The final grep from the brief is the check that nothing was missed or wrongly kept.

**Case directories follow the category.** The twelve `sca-NN-*` case directories and their ids become `dependency-NN-*`, because the id is built on the old word. Recorded results key on case id, so `benchmark/results` is renamed in the same group.

**Specs are edited in place, not as deltas.** The change declares `skip_specs: true` because no behavior changes. Editing `openspec/specs` directly keeps the specs describing the code as it is now, and archive has nothing to sync.

**Frozen files.** `src/shared/**` and the `package.json` name are edited because the proposal names them. `README.md` is not named, so it is left and reported.

## Risks / Trade-offs

- A blind match renames a kept word → the keep list is checked at the end by the grep from the brief, and every remaining hit is listed in the summary
- A renamed key is missed in JSON data that no test parses → grep the data directories for each old key after its group
- Renaming the code-review output schema field changes the LLM cache key → cached reviewer responses miss once, which costs one run of calls and is said in the summary
- Renaming case directories can break a path hard-coded in a script or doc → grep for `sca-` after group 1
- Biome import order can change when a file name changes → run `biome check` with the final `bun run verify`

## Migration Plan

No deployment. Saved review output and recorded results are rewritten in this change. Roll back by reverting the single commit.
