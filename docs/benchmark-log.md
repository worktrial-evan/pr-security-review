# Benchmark log

## Results summary

The live code-review prompt moves from v1 to v3, the moved-code rubric. It was kept because dev F1 rose and clean-case false positives did not, which is the rule this change was given. The lift is inside run-to-run noise, the test split did not move, and the case v3 targets is still missed. Read it as no measured change in quality at about 8 percent more cost.

| Split | Prompt | Precision | Recall | F1 | Code review F1 | Clean false positives | Cost per pull request | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dev, baseline | v1 | 0.818 | 0.692 | 0.750 | 0.621 | 1 | $0.0112 | $0.4128 |
| dev, final | v3 | 0.857 | 0.692 | 0.766 | 0.643 | 1 | $0.0121 | $0.4468 |
| test, baseline | v1 | 0.875 | 0.636 | 0.737 | 0.545 | 0 | $0.0114 | $0.1942 |
| test, final | v3 | 0.875 | 0.636 | 0.737 | 0.545 | 0 | $0.0124 | $0.2100 |

- **What moved dev F1.** Precision rose because real-world-07-ws lost a CWE-1333 false positive. A v1 rerun with no change dropped that same false positive and scored 0.792, so the move is noise and not the new rule.
- **What happened on the test split.** code-14 lost a CWE-94 false positive and code-15 gained a CWE-79 false positive. That leaves the same counts, so F1, precision and recall did not change.
- **The model.** Every run reviews with `anthropic/claude-sonnet-5-5` and summarizes with `anthropic/claude-haiku-5-5`, at the prices in `config/models.json`. The results files are under `benchmark/results`, named by timestamp and label: `baseline-rerun`, `cwe-798-allowlist`, `moved-code-rubric` and `final`. This change spent $1.49 on model calls across four runs.
- **The next candidate.** A CWE family hint list in the rubric targets the largest failure group, which is three cases and six errors on dev. A code change that shows the model lines removed from other files would let a rule catch clean-05. Because of the noise, a candidate should be judged on two or more dev runs.

## Candidates

Every candidate was run once on the dev split. Before is the committed baseline, prompt v1. Cost per pull request is the run's total cost divided by its 37 completed cases. The brief's rule keeps a candidate when dev F1 rises and clean-case false positives do not rise. It stops after the first candidate that lifts dev F1 by more than 0.03.

| Candidate | What changed | Dev F1 before | Dev F1 after | Clean false positives before | Clean false positives after | Cost per pull request before | Cost per pull request after | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `baseline-rerun`, a reference run | nothing: v1 again with `--no-cache` | 0.750 | 0.792 | 1 | 1 | $0.0112 | $0.0109 | not a candidate |
| `cwe-798-allowlist` | CWE-798 on the allowlist, and prompt v2, whose rule 2 admits a hard-coded credential | 0.750 | 0.720 | 1 | 1 | $0.0112 | $0.0116 | discarded |
| `moved-code-rubric` | prompt v3: v1 plus a rule that code a pull request only moves is pre-existing, with a `Moved code` worked example | 0.750 | 0.766 | 1 | 1 | $0.0112 | $0.0121 | kept |

- **`cwe-798-allowlist`, discarded because dev F1 fell.** It found code-05. The reviewer also reported the AWS key in secrets-01 as CWE-798, which counts as a false positive because that case's label belongs to the secrets detector. code-08 lost its prototype pollution match and tar was missed again, and neither one involves credentials. The allowlist entry was reverted. `prompts/code-review/v2.md` stays, because a version number is never reused, and no config points at it.
- **`moved-code-rubric`, kept by the rule.** Dev F1 rose by 0.016 and clean false positives held at 1. That lift is inside the spread of the reference run, and clean-05, the case the candidate targets, is still flagged. The function moves from `src/users.ts` to `src/user-search.ts`, and the packet skips `src/users.ts` because it has no added lines. The model sees only the new file, so no rule in the prompt can tell this move from new code. The gain comes from real-world-07-ws, whose CWE-1333 false positive also disappeared in the v1 reference run. v3 does handle a move inside one chunk, and its worked example is checked against the packet renderer. It costs about 8 percent more per pull request, because the prompt is longer.

Neither candidate cleared 0.03, so the stop rule never fired and both ran.

## Dev-split failures at the baseline

The committed baseline is `benchmark/results/baseline-dev.json`. Its audit logs and model cache were not kept, so the dev split was run again with v1 as `baseline-rerun`, with `--no-cache` and nothing else changed. That run's audit logs are the source for the model answers and grounding rejections below. No audit log in the rerun holds a `finding rejected by grounding` note, so the grounding filter removed no correct finding.

| Case | Expected | Model returned at the baseline | Rerun |
| --- | --- | --- | --- |
| `clean-05-refactor-moves-vulnerable-code` | nothing | CWE-89 on `src/user-search.ts` line 14 | the same finding on lines 13 to 15. The packet skipped `src/users.ts`, the file the function left, because it has no added lines |
| `code-05-hardcoded-credential` | CWE-798 on `src/server.ts` lines 72 to 73 | nothing | nothing. The answer was `{"findings":[],"injectionAttempts":[]}`, so the model never tried CWE-798 |
| `code-06-jwt-verification-disabled` | CWE-347 on `src/auth.ts` lines 45 to 46 | CWE-287 on lines 45 to 49 | the same |
| `code-09-md5-password-hashing` | CWE-328 on `src/users.ts` lines 76 to 77 | nothing | nothing |
| `code-10-eval-request-input` | CWE-95 on `src/server.ts` lines 104 to 105 | CWE-94 on lines 104 to 105 | CWE-94 on line 105 |
| `real-world-04-tar` | CWE-400 on `lib/unpack.js` lines 242 to 260 | nothing | found |
| `real-world-05-path-to-regexp` | CWE-1333 on `index.js` lines 75 to 88 | nothing | nothing |
| `real-world-07-ws` | CWE-400 on `lib/websocket-server.js` line 289 | CWE-1333 on line 289, confidence 0.5 | nothing |
| `secrets-01-aws-key-in-config` | a secret on `src/config.ts` line 21 | nothing from the secrets rules | nothing |

Grouped by cause, largest first:

1. **A correct finding under a CWE the scorer does not join.** It costs one false positive and one false negative each time: CWE-287 for CWE-347, CWE-94 for CWE-95, and CWE-1333 for CWE-400. It covers three cases and six errors. This is the largest group, but the brief capped the change at two named candidates, so it is the next candidate. A CWE family hint list in the rubric is the brief's fix for it.
2. **An input-less class the rubric rules out.** Rule 2 of v1 says a hard-coded credential or a weak algorithm is outside the review, so the model returns nothing on code-05 and code-09. It covers two cases. Candidate 1 addresses code-05.
3. **A real-world miss with no prediction.** It covers path-to-regexp at both runs and tar at the baseline only.
4. **Moved code flagged as new.** It covers clean-05, the only false positive on a clean case.
5. **A secrets rule miss.** It covers secrets-01, which is outside this change.

## Run-to-run spread

The rerun scored dev F1 0.792 against the committed baseline's 0.750 with the same prompt, model and code. It found tar, and it no longer reported the CWE-1333 finding on ws. That is a spread of 0.042 between two identical runs, larger than the 0.015 that `docs/benchmark.md` measured. A lift of one case is about 0.02, so a single run cannot tell a one-case gain from noise. Each candidate below is judged by the brief's rule against the committed baseline, and each row also says whether the case it targets changed.
