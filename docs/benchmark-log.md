# Benchmark log

## Results summary

The live code-review prompt is v4, which adds CWE choice hints. Two ids join the allowlist with it: CWE-95 and CWE-347. On dev, v4 scored F1 0.851 on both of its runs, against 0.766 on both v3 runs and 0.750 at the baseline. The test split did not improve: it scored 0.700, against 0.737 for v1 and v3. Read v4 as a fix for two dev cases whose CWE pairs the hints name. Nothing yet shows that it generalizes.

| Split | Prompt | Precision | Recall | F1 | Code review F1 | Clean false positives | Cost per pull request | Total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dev, baseline | v1 | 0.818 | 0.692 | 0.750 | 0.621 | 1 | $0.0112 | $0.4128 |
| dev, v3 | v3 | 0.857 | 0.692 | 0.766 | 0.643 | 1 | $0.0121 | $0.4468 |
| dev, final | v4 | 0.952 | 0.769 | 0.851 | 0.786 | 1 | $0.0127 | $0.4703 |
| test, baseline | v1 | 0.875 | 0.636 | 0.737 | 0.545 | 0 | $0.0114 | $0.1942 |
| test, v3 | v3 | 0.875 | 0.636 | 0.737 | 0.545 | 0 | $0.0124 | $0.2100 |
| test, final | v4 | 0.778 | 0.636 | 0.700 | 0.500 | 0 | $0.0129 | $0.2195 |

- **What moved dev F1.** code-06 now names CWE-347 and code-10 names CWE-95, so each one turns a false positive and a false negative into a true positive. Both v4 runs gave the same counts on every case, and so did both v3 runs. The v1 to v3 step of 0.016 is noise: a v1 rerun scored 0.792.
- **What happened on the test split.** code-14 parses a request body with a JSON reviver that runs `new Function`, and its label is CWE-502. v4 names CWE-95 there, and v1 named CWE-94, so both are false positives. The v3 run reported nothing on that case. code-15 has a CWE-79 false positive under both v3 and v4. The test failures are other CWE pairs, such as CWE-502 and CWE-548, which the hints do not cover.
- **The model.** Every run reviews with `anthropic/claude-sonnet-5-5` and summarizes with `anthropic/claude-haiku-5-5`, at the prices in `config/models.json`. The results files are under `benchmark/results`, named by timestamp and label. The two changes behind this log spent $3.09 on model calls across eight runs.
- **The next candidate.** Deserialization that runs code needs a hint toward CWE-502, but that pair fails only on the test split. It needs a dev case before a hint for it is fair. A code change that shows the model lines removed from other files would let a rule catch clean-05. A candidate should be judged on two or more dev runs.

## Candidates

The first two candidates were run once on the dev split, against the committed baseline on prompt v1. The CWE family hint candidate was run twice, against two runs of v3, the live prompt at the time. Cost per pull request is the run's total cost divided by its 37 completed cases. The brief's rule keeps a candidate when dev F1 rises and clean-case false positives do not rise. It stops after the first candidate that lifts dev F1 by more than 0.03.

| Candidate | What changed | Dev F1 before | Dev F1 after | Clean false positives before | Clean false positives after | Cost per pull request before | Cost per pull request after | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `baseline-rerun`, a reference run | nothing: v1 again with `--no-cache` | 0.750 | 0.792 | 1 | 1 | $0.0112 | $0.0109 | not a candidate |
| `cwe-798-allowlist` | CWE-798 on the allowlist, and prompt v2, whose rule 2 admits a hard-coded credential | 0.750 | 0.720 | 1 | 1 | $0.0112 | $0.0116 | discarded |
| `moved-code-rubric` | prompt v3: v1 plus a rule that code a pull request only moves is pre-existing, with a `Moved code` worked example | 0.750 | 0.766 | 1 | 1 | $0.0112 | $0.0121 | kept |
| `v3-rerun`, a reference run | nothing: v3 again with `--no-cache` | 0.766 | 0.766 | 1 | 1 | $0.0121 | $0.0122 | not a candidate |
| `cwe-family-hints` | prompt v4: v3 plus a CWE choice section, with CWE-95 and CWE-347 added to the allowlist | 0.766 | 0.851 | 1 | 1 | $0.0121 | $0.0127 | kept |
| `cwe-family-hints-rerun` | the same as `cwe-family-hints`, with `--no-cache` | 0.766 | 0.851 | 1 | 1 | $0.0121 | $0.0126 | the second run of the kept candidate |

- **`cwe-798-allowlist`, discarded because dev F1 fell.** It found code-05. The reviewer also reported the AWS key in secrets-01 as CWE-798, which counts as a false positive because that case's label belongs to the secrets detector. code-08 lost its prototype pollution match and tar was missed again, and neither one involves credentials. The allowlist entry was reverted. `prompts/code-review/v2.md` stays, because a version number is never reused, and no config points at it.
- **`moved-code-rubric`, kept by the rule.** Dev F1 rose by 0.016 and clean false positives held at 1. That lift is inside the spread of the reference run, and clean-05, the case the candidate targets, is still flagged. The function moves from `src/users.ts` to `src/user-search.ts`, and the packet skips `src/users.ts` because it has no added lines. The model sees only the new file, so no rule in the prompt can tell this move from new code. The gain comes from real-world-07-ws, whose CWE-1333 false positive also disappeared in the v1 reference run. v3 does handle a move inside one chunk, and its worked example is checked against the packet renderer. It costs about 8 percent more per pull request, because the prompt is longer.

Neither candidate cleared 0.03, so the stop rule never fired and both ran.

- **`cwe-family-hints`, kept on two dev runs.** It targets the largest dev failure group: a correct finding named by a neighboring CWE that the scorer does not join with the label. The before number for this candidate is v3, the live prompt then, which scored 0.766 on both of its runs. v4 scored 0.851 on both of its runs and kept clean false positives at 1, so its mean rose by 0.085. code-06 and code-10 now match. real-world-07-ws is still missed, because the model reports nothing on it under v3 or v4. The hints come from dev failures only. The test split fell by one false positive, as the results summary explains.

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
