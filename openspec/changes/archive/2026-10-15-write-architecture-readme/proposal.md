# Proposal

## Why

The README is half written. Its Benchmark, Model and cost, Audit log, Gaps and What's next sections are placeholders. Its module graph shows the allowed-imports matrix instead of the imports the code really has, and it shows a harness and a server that hold no code. An evaluator who reads the repository cold cannot learn from it how a review runs, what is deterministic, how model output is constrained, what the trust boundaries are or how the benchmark scores the agent. The pipeline, CLI and baseline benchmark have all merged, so the architecture is stable enough to describe.

## What Changes

- Rewrite `README.md` as one architecture document in sixteen sections, in this order: what it is, quick start, architecture, one review step by step, deterministic and model-driven parts, a finding's life, security model, benchmark, results, improving the agent, audit log, configuration, repository map, extension points, gaps and limitations, what's next.
- Draw every diagram from the merged code in Mermaid, using `flowchart` and `sequenceDiagram` only, with no HTML in labels. The module flowchart is built from `bunx depcruise` output, so it shows real imports and not the matrix. The other diagrams are a review sequence, the trust boundaries and the three nested benchmark layers.
- Give every module, file and doc the README names a relative link to its place in the repository.
- Run every Quick start command before writing it down. Take every number from a results file, a doc that cites one, or a command's output.
- Add `docs/architecture/module-imports.md`. It records the depcruise command and its module-level output, so a reader can check the flowchart against the code.
- Fix any broken relative link found in an `AGENTS.md`. No other edit is made to a module doc.
- No code, config, test or dependency changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change is documentation only and no system behavior changes, so `.openspec.yaml` sets `skip_specs: true`.

## Impact

- `README.md`: a frozen file, named here so this change may rewrite it.
- `docs/architecture/module-imports.md`: new.
- `AGENTS.md` files: only broken relative links are fixed, if any are found.
- Nothing under `src/`, `scripts/`, `benchmark/`, `config/` or `prompts/` changes, and no dependency is added. `bun run verify` must still pass.
- Running the Quick start spends model credits: one code-change review and one uncached benchmark run on the configured Anthropic models. The baseline docs put an uncached benchmark run of both splits at about $0.61. Runs write only to `runs/` and the cache directory, and both are gitignored.
- Where a doc and the code disagree, the README describes the code. Every such mismatch is listed in the final summary and in `design.md`, and not fixed in this change.
