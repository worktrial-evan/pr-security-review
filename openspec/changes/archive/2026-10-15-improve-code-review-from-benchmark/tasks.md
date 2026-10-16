# Tasks

## 1. Failure analysis

- [x] 1.1 Run `bun index.ts benchmark run --split dev --label baseline-rerun --no-cache`. Verify a results file and one `runs/<runId>/audit.jsonl` per case exist.
- [x] 1.2 For each failing dev case, list the expected label, what the model returned, and every `finding rejected by grounding` note from its audit log. Write the table to the failures section of `docs/benchmark-log.md`. Verify every failing case from the committed baseline and the rerun has a row.
- [x] 1.3 Record which branch of candidate 1 applies: is there a CWE-798 rejection on code-05? Write it in the log. Verify the log names the branch and the audit line that decides it.

## 2. Candidate 1: CWE-798 on the allowlist

- [x] 2.1 Add `CWE-798: Use of Hard-coded Credentials` to the allowlist. Move CWE-798 from the excluded list in `vulnerability-type-allowlist.test.ts` to the membership test, and add a grounding test that keeps a CWE-798 finding. Verify with `bun test src/code-review/vulnerability-type-allowlist.test.ts src/code-review/grounding.test.ts`.
- [x] 2.2 On the no-attempt branch, add `prompts/code-review/v2.md`, a copy of v1 whose rule 2 admits a hard-coded credential. Make `review-prompt.test.ts` and `prompt-examples.test.ts` loop over every shipped version. Verify with `bun test src/code-review` and `git diff --exit-code prompts/code-review/v1.md`.
- [x] 2.3 Run `bun index.ts benchmark run --split dev --label cwe-798-allowlist`, adding `--review-prompt-version 2` on the no-attempt branch. Keep or discard by the rule. On a discard, revert 2.1. Record the row in the log. Verify the row holds dev F1, clean false positives and cost per pull request, before and after.

## 3. Candidate 2: moved code is pre-existing

- [x] 3.1 Skip this group only if candidate 1 lifted dev F1 by more than 0.03. Otherwise add the next prompt version on top of the best kept prompt, with the moved-code rule and a `moved code` worked example. Verify with `bun test src/code-review` and `git diff --exit-code prompts/code-review/v1.md`.
- [x] 3.2 Run `bun index.ts benchmark run --split dev --label moved-code-rubric --review-prompt-version <N>`. Keep or discard by the rule, and record the row in the log. Verify the row is complete and clean-05 is named in its reason.

## 4. Final numbers

- [x] 4.1 Set `reviewPromptVersion` in `config/review.json` to the kept version. Verify with `bun test src/pipeline/review-settings.test.ts`.
- [x] 4.2 Run `bun index.ts benchmark run --split test --label final` once on the kept configuration. Verify it is the only test-split results file this change adds.
- [x] 4.3 Write the results summary at the top of `docs/benchmark-log.md`. It holds the baseline and final numbers on both splits, the change that moved them, the model and the cost, and it names the CWE mislabel group as the next candidate. Copy the kept runs' results JSON and HTML into `benchmark/results`. Verify every candidate, including any discarded one, has a row with a reason.
- [x] 4.4 `bun run verify` passes.
- [x] 4.5 `src/code-review/AGENTS.md` updated: the allowlist count and invariant, the prompt versions, the per-version prompt tests, and the Known gaps. Verify with `bun run verify` again.

## Workflow follow-up

- Commit once after 4.5, with no archive, as the session brief says. This overrides the commit-after-archive rule for this change.
