# Proposal

## Why

The baseline code reviewer scores dev F1 0.750 and code-review F1 0.621. `docs/benchmark.md` names two fixes first: CWE-798 is missing from the allowlist, and the clean case that only moves vulnerable code gets flagged. This change measures those two fixes and keeps whichever one helps.

## What Changes

The dev-split failures in `benchmark/results/baseline-dev.json`, grouped by cause:

| Cause | Cases | Errors |
| --- | --- | --- |
| A correct finding with a CWE the scorer's families do not join: 287 for 347, 94 for 95, 1333 for 400 | code-06, code-10, real-world-07-ws | 3 FP, 3 FN |
| An input-less class outside the allowlist and outside rule 2 of v1: CWE-798, CWE-328 | code-05, code-09 | 2 FN |
| A real-world miss with no prediction | real-world-04-tar, real-world-05-path-to-regexp | 2 FN |
| Code the pull request only moves, flagged as new | clean-05 | 1 FP on clean |
| A secrets rule miss, outside this scope | secrets-01 | 1 FN |

- **Candidate 1, the CWE-798 allowlist entry.** It adds `CWE-798: Use of Hard-coded Credentials` to `src/code-review/vulnerability-type-allowlist.ts`.
- **Candidate 2, a moved-code rubric.** It adds a new prompt version that treats code the pull request only moves as pre-existing, with a worked example.
- **The benchmark log.** `docs/benchmark-log.md` records both candidates with before and after numbers and a results summary at the top.
- **The live prompt version.** `config/review.json` names the kept prompt version.

## Decisions taken on open details

- **Audit logs.** The baseline `runs/*/audit.jsonl` files and its model cache are not on this machine. The first task reruns the dev split as `baseline-rerun` to rebuild them. The committed baseline stays the before number. The rerun is reported as a noise check.
- **Candidate 1 and rule 2 of v1.** Rule 2 of v1 puts hard-coded credentials outside the review. When the rerun audit shows a CWE-798 finding the grounding filter rejected on code-05, candidate 1 is only the allowlist entry, run with v1, and candidate 2 is v2. When it shows no attempt, candidate 1 also needs v2, which copies v1 and narrows rule 2 to admit a hard-coded credential. Candidate 2 is then v3. v1 is never edited.
- **Candidates stack.** Candidate 2 builds on candidate 1 when candidate 1 is kept, and on the baseline when it is not. Its before number is the best kept state so far.
- **The stop rule.** A perfect candidate 1 turns one false negative into a true positive, and a perfect candidate 2 removes one false positive. Each one is worth about 0.02 of dev F1. The keep rule is unchanged: dev F1 rises and clean-case false positives do not rise. The v1 rerun moved dev F1 by 0.042 with nothing changed, so a single run cannot separate a one-case gain from noise. The log says so for every row.
- **The largest failure group goes untried.** The two-candidate cap leaves the CWE mislabel group for later. The log names it as the next candidate.
- **Discarded work.** A discarded allowlist edit is reverted. A discarded prompt file stays in place, because a version number is never reused. `config/review.json` pins the live version.
- **One test run.** The test split runs once, on the final kept configuration.
- **Cost per pull request.** It is the total run cost divided by the completed cases.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-review-detection`: prompt versions after v1, the moved-code rule, and CWE-798 on the allowlist when that candidate is kept
- `review-configuration`: `reviewPromptVersion` is the kept version, not a fixed "1"

## Impact

- `src/code-review`: the allowlist and its test, the prompt tests that assumed one version, a new test fixture that loads every version, and `AGENTS.md`
- `prompts/code-review/v2.md`, and `v3.md` when candidate 1 needs v2
- `config/review.json` and its test in `src/pipeline/review-settings.test.ts`, which pins the checked-in value
- `docs/benchmark-log.md` and new files under `benchmark/results`, including the overwritten `latest-dev` and `latest-test` pages
- Model spend: about $0.41 per dev run and $0.19 for the test run, so about $1.50 in total for four dev runs and one test run
- No frozen file, no dependency and no shared contract changes
