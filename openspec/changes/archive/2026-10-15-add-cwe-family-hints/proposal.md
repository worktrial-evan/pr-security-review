# Proposal

## Why

The largest dev failure group in `docs/benchmark-log.md` is a correct finding under a neighboring CWE that the scorer does not join with the label. It covers code-06 (CWE-287 for CWE-347), code-10 (CWE-94 for CWE-95) and real-world-07-ws (CWE-1333 for CWE-400), and it costs six errors on three cases. Two of the labeled ids are not on the allowlist, so the model cannot name them today.

## What Changes

- **The allowlist.** It gains `CWE-95: Eval Injection` and `CWE-347: Improper Verification of Cryptographic Signature`. Both have an untrusted input: the evaluated text and the unverified token.
- **Prompt v4.** It copies v3 and adds a CWE choice section that tells the model to pick the most specific id, with three family hints: CWE-347 over CWE-287, CWE-95 over CWE-94, and CWE-1333 only for backtracking regexes, with CWE-400 for other unbounded work.
- **The benchmark log.** It records the candidate's dev runs and decision.

## Decisions taken on open details

- **The comparison.** v3 has one dev run. A second v3 run with `--no-cache` gives v3 a mean, and v4 runs twice: once with the cache and once without. The candidate is kept when the mean dev F1 of v4 is above the mean of v3 and clean-case false positives do not rise on either run.
- **A discard.** The allowlist entries are reverted. `prompts/code-review/v4.md` stays, because version numbers are never reused.
- **A keep.** `config/review.json` and the pipeline settings test move to 4, and the test split runs once.
- **The hints come from dev failures only.** No test case shapes them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-review-detection`: the allowlist holds CWE-95 and CWE-347, and later prompt versions may carry CWE choice hints

## Impact

- `src/code-review`: the allowlist and its test, the prompt tests, and `AGENTS.md`
- `prompts/code-review/v4.md`, `docs/benchmark-log.md` and new files under `benchmark/results`
- `config/review.json` and `src/pipeline/review-settings.test.ts` when the candidate is kept
- Model spend: about $1.40 for three dev runs and one test run
