# Tasks

## 1. Candidate

- [x] 1.1 Run v3 on dev again with `--no-cache` as `v3-rerun`, before any allowlist edit. Verify a results file with prompt version 3 exists.
- [x] 1.2 Add CWE-95 and CWE-347 to the allowlist and its test. Verify with `bun test src/code-review/vulnerability-type-allowlist.test.ts`.
- [x] 1.3 Add `prompts/code-review/v4.md`, a copy of v3 with a CWE choice section, and a test that every id the section names is on the allowlist. Verify with `bun test src/code-review` and `git diff --exit-code prompts/code-review/v1.md prompts/code-review/v2.md prompts/code-review/v3.md`.
- [x] 1.4 Run v4 on dev as `cwe-family-hints`, then again with `--no-cache` as `cwe-family-hints-rerun`. Keep or discard by the rule in the proposal. On a discard, revert 1.2. Verify the decision follows from the four dev runs.

## 2. Record

- [x] 2.1 On a keep, set `reviewPromptVersion` to 4 in `config/review.json` and `src/pipeline/review-settings.test.ts`, and run the test split once as `final-v4`. Verify with `bun test src/pipeline/review-settings.test.ts`.
- [x] 2.2 Add the candidate's rows to `docs/benchmark-log.md` and update its results summary. Verify every run of this change has a row and the summary names the live version.
- [x] 2.3 `bun run verify` passes.
- [x] 2.4 `src/code-review/AGENTS.md` updated: the allowlist count, the prompt versions and the Known gaps. Verify with `bun run verify` again.

## Workflow follow-up

- Commit once after 2.4, with no archive, as for the change before it.
