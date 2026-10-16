# Proposal

## Why

The pipeline has no LLM reviewer yet, so a pull request that introduces an injection, a missing check or a dangerous sink produces no finding. The fence, the llm client and the prompt loader are in place, so the detector can be built on them now.

## What Changes

- Add `reviewCode` in `src/code-review`: assembles a deterministic review packet from the changed files, sends each file or chunk to the model inside an untrusted-content fence, validates the structured answer, keeps only findings grounded in added lines, dedupes them and returns `CodeReviewFinding` values with the counts the pipeline records.
- Add `prompts/code-review/v1.md`: the review rubric with the severity definitions, the CWE allowlist, the output rules and three worked examples.
- Document the packet format and the grounding rules in `src/code-review/AGENTS.md`.

Assumptions taken for details the brief leaves open:

- The packet caps the context each hunk already carries at `contextLines`. It never reads file content to add context, because the pull request source produces hunks with that many context lines.
- A removed line renders with the head line number the source stores, which is 0, so every line has one code path.
- A file with no added lines is skipped like a binary or deleted file, because no finding in it could be grounded.
- A file is chunked when its hunks hold more than 500 rendered lines. Whole hunks fill each chunk in order, and a hunk larger than the limit is a chunk on its own.
- The prompt file renders into the system prompt, with the fence description and the CWE allowlist as its two variables. The user prompt is the fenced chunk and nothing else.
- The CWE allowlist lives in code and is rendered into the prompt, so the grounding filter and the rubric cannot disagree. It holds only weaknesses reachable from an untrusted input, because the rubric demands a named input, so hard-coded credentials, weak algorithms, cleartext storage and transmission, weak randomness and permission assignment are out of scope for this reviewer.
- Dedupe is pairwise: a finding is dropped when another with the same file and CWE overlaps it with a higher confidence, or an equal confidence and an earlier position.
- The packet rejects malformed input with an error: a negative or fractional context count, a chunk limit below one, a path with a newline, or a path named twice.
- A finding that names a file other than the chunk's file is rejected by grounding with its own reason.
- A chunk whose output fails the schema twice is skipped with an audit note and counted in `failedChunkCount`. Other chunks still run. Any other error from the llm client propagates.
- Chunks are reviewed one after another, so the fake provider's replies land in packet order.
- The detector writes `note` and `finding` audit events under the step `code-review`. The pipeline owns the step-start and step-end events.
- The prompt is loaded before the enabled check, so the result always reports the prompt version.

## Capabilities

### New Capabilities

- `code-review-detection`: LLM review of the lines a pull request adds, with deterministic packet assembly, a fenced prompt, schema validation, grounding, dedupe and audit.

### Modified Capabilities

None.

## Impact

- New files under `src/code-review/`, its `fixtures/` and `__snapshots__/`, and the new `prompts/code-review/v1.md`.
- Imports shared, llm and prompts, which the matrix already grants. No dependency, shared contract, matrix or frozen file changes.
- The pipeline wires `reviewCode` in with its own change. A verifier pass and benchmark-derived examples are left to the improvement change.
