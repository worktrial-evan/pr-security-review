# Tasks

## 1. Gather the source material

- [x] 1.1 Read every `AGENTS.md`, `docs/benchmark.md`, `docs/decisions.md`, `openspec/config.yaml`, `config/` and `package.json`, plus the code each README section links. Verify that every mismatch found between a doc and the code is added to design.md D8.
- [x] 1.2 Run the depcruise command from design D2 and write `docs/architecture/module-imports.md` with the command, the date, the commit and the module-level edges under `src/` without tests. Verify by rerunning the command and diffing its filtered output against the edge list in the file.
- [x] 1.3 Run every Quick start command from design D4 with output captured in the scratchpad. Record each exit status, output path and cost line. Restore `benchmark/results/latest-*.json` with `git checkout`. Verify that `git status` then shows no change under `benchmark/` and nothing staged under `runs/`.

## 2. Write the README, sections 1 to 8

- [x] 2.1 Write section 1, What it is, and section 2, Quick start, from the captured runs. Verify that every command in the section appears in the scratchpad run log with the exit status the README states.
- [x] 2.2 Write section 3, Architecture, with the depcruise flowchart, the two rules and their enforcement links. Verify that every arrow in the diagram is an edge in `docs/architecture/module-imports.md`, and that the diagram passes the design D3 syntax rules by eye.
- [x] 2.3 Write section 4, One review step by step, with the sequence diagram and one paragraph per step. Verify that the step order and stage names match `reviewSteps` and `stagesByStep` in `src/pipeline/run-step.ts`, and that each audit note named appears in `src/pipeline`.
- [x] 2.4 Write section 5, Deterministic and model-driven parts, and section 6, A finding's life. Verify that each linked mechanism exists by opening its file, and that every field named is in `src/shared/finding.ts`.
- [x] 2.5 Write section 7, Security model, with the trust boundary flowchart, the attack, defense and file table, and the residual risks. Verify that every file in the table exists and does what its row says, by reading it.
- [x] 2.6 Write section 8, Benchmark, with the nested layers diagram, categories, label sources, match rules, splits, reproducibility and variance. Verify that every number matches `docs/benchmark.md` or a results file.

## 3. Write the README, sections 9 to 16

- [x] 3.1 Write section 9, Results, from `benchmark/results/baseline-dev.json` and `baseline-test.json`, with a pending row and the `jq` command behind the cost per pull request. Verify by rerunning the `jq` command and comparing.
- [x] 3.2 Write section 10, Improving the agent, and section 11, Audit log, with one real redacted line copied from a run in 1.3. Verify that the line is valid JSON with the `AuditEvent` fields and holds no secret value.
- [x] 3.3 Write section 12, Configuration, and section 13, Repository map. Verify that every key in `config/review.json` and `config/models.json` and every variable in `.env.example` is described, and that all nineteen modules are listed with a link.
- [x] 3.4 Write section 14, Extension points, naming the exact files for each extension. Verify that each named file exists and holds the code the extension would change, such as the lockfile registry, the OSV ecosystem constant, `DetectorKind` and the report format list.
- [x] 3.5 Write section 15, Gaps and limitations, with the brief's list plus gaps found in the code, and section 16, What's next. Verify that each gap is backed by code read or a module's Known gaps section.

## 4. Check the whole document

- [x] 4.1 Run a throwaway Bun script from the scratchpad that resolves every relative link and in-page anchor in `README.md` and `docs/architecture/module-imports.md`. Verify that it reports zero broken links. Do not commit the script.
- [x] 4.2 Run the same script over every `AGENTS.md` and fix only the broken relative links it reports. Verify that a rerun reports zero.
- [x] 4.3 Read every Mermaid block against the design D3 rules: only `flowchart` and `sequenceDiagram`, no HTML in labels, no reserved words as ids. Verify each block by eye and note the check in the summary.
- [x] 4.4 Read the README once top to bottom for plain words and short sentences, with no marketing terms and no number without a source. Verify by searching for every digit and confirming each one's source.
- [x] 4.5 bun run verify passes
- [x] 4.6 module AGENTS.md updated: only the broken links fixed in 4.2, since no module code changes. Verify with `git diff --stat` that no file under `src/` other than an `AGENTS.md` changed.

## Workflow follow-up

- Write the summary: what was written, what could not be verified, such as the token form of the review command, the mismatches from design D8, and what to review.
- The user archives the change. After that, one commit holds `README.md`, `docs/architecture/`, any fixed `AGENTS.md` and the archived change. Never push and never merge.
