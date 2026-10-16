# Design

## Context

See proposal.md for the failure groups and the decisions on open details. Three facts shape the approach:

- `benchmark run` takes `--review-prompt-version`, so a candidate runs without editing `config/review.json`.
- The scorer joins only the CWE-79 and CWE-22 families, and it matches a range within 5 lines.
- `review-prompt.test.ts` and `prompt-examples.test.ts` load the highest prompt version present. Adding a v2 changes what they check.

## Goals / Non-Goals

**Goals:** measure each candidate on dev with one run, keep it or discard it by the brief's rule, and record every run.

**Non-Goals:** the CWE mislabel group, the secrets miss, the scorer's families, a verifier call, wider context lines, and a packet that shows lines removed from other files.

## Decisions

### Read the failures from the rerun audit

The rerun with label `baseline-rerun` uses `--no-cache`. No cache exists anyway, and this makes the run explicit. Its `runs/<runId>/audit.jsonl` files give the grounding rejections the brief asks for. The per-case table goes in the log. The alternative was to work from the results JSON alone. That loses the one fact candidate 1 depends on: whether the model already tried CWE-798 on code-05.

### Branch candidate 1 on that fact

- **A rejected CWE-798 finding exists.** Candidate 1 is the allowlist entry alone, run with v1. Candidate 2 is v2.
- **No attempt exists.** Candidate 1 adds v2, a copy of v1 whose rule 2 admits a hard-coded credential. The credential is the input, and the place it authenticates is the sink. Candidate 2 is v3, built on v2 when candidate 1 is kept and on v1 when it is not.

A candidate that fails the bar on an untried version would tell us nothing, so a copy of rule 2 is the smallest change that makes the candidate testable. The rerun audit shows an empty answer on code-05, so the no-attempt branch applied.

### The moved-code rule

It is a new rule plus a fourth worked example titled `moved code`. In the example one chunk removes a vulnerable function and adds it back unchanged further down the same file. The answer is empty. The rule allows one exception: a move that sends new untrusted input into the code is still a finding. The alternative was to compare removed and added lines in code before the model call. That needs no prompt, but it changes grounding behavior on every case and would be a second change in one candidate.

### Prompt tests over every version

`review-prompt.test.ts` and `prompt-examples.test.ts` loop over every shipped version file. They check the load, the variables, and the grounded examples per version, so the kept version and v1 both stay covered. The example-title check requires the three v1 titles in every version, and `moved code` in the version that carries the rule.

### Clean false positives

The brief's clean-case count is `falsePositivesOnClean` from the score.

## Risks / Trade-offs

- **[A move across files is invisible]** clean-05 moves a function to a new file. The file it leaves has no added lines, so the packet skips it and the model never sees the removal. → The rule is limited to moves inside one chunk. The log records that v3 cannot fix clean-05 and names a packet change as the follow-up.

- **[Noise]** A one-case gain is inside the 0.015 run-to-run spread. → The log states each candidate's lift beside that spread. A kept candidate with a lift under 0.03 is marked as within noise.
- **[CWE-798 overlaps the secrets detector]** One credential can become two findings. A code-review CWE-798 finding on a case labeled for the secrets detector scores as a false positive. That happened on secrets-01 and is one reason candidate 1 was discarded.
- **[Rule 2 widened]** Admitting credentials could add false positives on clean cases with test fixtures. → The keep rule rejects any candidate that raises clean false positives.

## Migration Plan

`config/review.json` moves to the kept version. Rolling back sets it to "1". Earlier versions stay loadable.
