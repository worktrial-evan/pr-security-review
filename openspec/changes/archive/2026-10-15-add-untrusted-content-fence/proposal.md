# Proposal

## Why

The code reviewer, the summarizer and the harness all put attacker-controlled text, such as diffs, evidence lines and advisory text, into model prompts. Each would otherwise invent its own defense against prompt injection. One tested fence keeps that defense in one place.

## What Changes

- Add `fenceUntrustedContent({ label, content })` in `src/prompts`, which wraps content in a deterministic nonce fence and returns the label, nonce, tags and fenced text.
- Add `describeFence(fence)`, which returns the system prompt sentence that tells the model the fenced text is data and its instructions are not followed.
- Document both functions, the nonce rule and why the nonce is not random in `src/prompts/AGENTS.md`.

Assumptions taken for details the brief leaves open:

- A valid label is lowercase kebab-case: lowercase letters and digits in segments joined by single hyphens, starting with a letter.
- The first nonce hashes the label, a newline and the content. A rehash with counter N hashes the label, a newline, the content, a newline and N, with N starting at 1.
- The fence types are plain TypeScript types in `fence-untrusted.ts`, not shared contracts.

## Capabilities

### New Capabilities

- `untrusted-content-fence`: wrapping attacker-controlled text in a deterministic nonce fence before it reaches a model.

### Modified Capabilities

None.

## Impact

- New files only under `src/prompts/`: `fence-untrusted.ts`, `fence-untrusted.test.ts` and an updated `AGENTS.md`.
- No dependency, shared contract, matrix or frozen file changes. The module imports nothing beyond built-ins.
- code-review, summarize and the harness wire the fence in with their own changes.
