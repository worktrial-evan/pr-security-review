# The benchmark

The benchmark measures the reviewer. It runs the review pipeline over a fixed set of labeled pull requests and compares what the pipeline reports with what each pull request is known to contain. A prompt or model change is better when the benchmark score goes up, and worse when it goes down.

## The corpus

The corpus holds 54 cases under `benchmark/cases`. Each case is one pull request with a label saying which findings a correct reviewer must report.

The cases fall into five categories:

- 12 dependency cases (`dependency`): a pull request changes a dependency and a known advisory applies, or does not.
- 15 code cases (`code`): a pull request adds one weakness to the code.
- 4 secrets cases (`secrets`): a pull request commits a credential.
- 15 clean cases (`clean`): a pull request that looks suspicious but adds nothing a reviewer should flag.
- 8 real-world cases (`real-world`): a public security fix, reversed.

Every case belongs to a split, `dev` or `test`. About 70 percent of the cases in each category are dev and the rest are test. The dev split is for tuning. The test split is never used for tuning. It exists to show whether an improvement on dev holds up on cases nobody looked at while tuning.

### Where the cases come from

The synthetic cases, which are every case but the real-world ones, are modifications of one small fixture application under `benchmark/fixtures/app`. Each case holds a full copy of that application before the change in `base/` and after the change in `head/`. The difference between the two copies is the pull request.

The real-world cases point at a public repository. The base is the commit that fixed a published advisory and the head is that commit's parent. So the pull request reintroduces a vulnerability that was really shipped and really fixed.

### Where the labels come from

A label is written by hand from the diff. For a synthetic case, the author reads the change they made and records what a reviewer must report: the package and advisory id for a dependency case, the CWE with the file and line range for a code case, the file and line for a secrets case, and nothing for a clean case.

For a real-world case the label comes from the advisory. The advisory id and CWE are the advisory's own, and the file and line range are the lines the reversed fix adds.

A dependency label names only the advisories the pull request introduces: the head version is in the advisory's range and the base version is not. When two advisory ids are aliases of each other, the pair counts as one advisory, so when either one already affects the base version the pair is pre-existing and is not labeled. Deciding that at the alias level is the detector's job, and a detector that reports such an alias as introduced is scored a false positive. The validator checks that every labeled advisory id is in the advisory fixture, as an id or an alias.

The dependency cases are checked against a pinned advisory snapshot under `benchmark/fixtures/advisories`, so a run never needs the network for a dependency case.

## How a prediction is matched to a label

The scorer compares the findings the pipeline returns for a case, called predictions, with the findings the case expects, called labels. A prediction that meets a label's rule is a match. These are the rules.

### Only introduced findings count

A finding whose `isIntroducedByPullRequest` is false is set aside as pre-existing. It never counts as a true positive and never counts as a false positive. The results file lists these findings per case so a person can see them, but they do not move the score.

### Detectors must match first

A label and a prediction can only match when they come from the same detector. A dependency label never matches a code-review prediction, even when both name the same file and lines.

### Dependency rule

A dependency prediction matches a dependency label when both are true:

- The package names are equal.
- The label's advisory id equals the prediction's advisory id, or is one of the prediction's aliases.

So a label that names a CVE matches a prediction that reports the GHSA id for the same advisory, as long as the CVE is among its aliases. Package names and advisory ids are compared exactly, character for character. A label without an advisory id matches nothing.

### Code rule

A code-review prediction matches a code-review label when all of these are true:

- The CWEs are equal or in the same family. The families are CWE-79 with CWE-80 and CWE-22 with CWE-23. The comparison ignores case, leading zeros in the number, and accepts a CWE with or without the `CWE-` prefix.
- The files are equal.
- The line ranges are within 5 lines of each other. The label's range is widened by 5 lines on each side and the prediction's range must overlap the widened range. A range with no end line is one line long.

A label with no file matches on the CWE family alone. A label with a file but no start line matches on the file and CWE alone, and a prediction with no start line never matches a label that has one.

Two examples. A label on lines 40 to 42 matches a prediction on lines 46 to 47, because 46 is within 5 lines of 42. The same label does not match a prediction on lines 48 to 49, because 48 is 6 lines past 42.

### Secret rule

A secrets prediction matches a secrets label when both are true:

- The files are equal.
- The prediction's start line is at most 2 lines away from the label's start line, in either direction.

So a label on line 7 matches a prediction on line 9 and does not match a prediction on line 10. A label without a file or a start line matches nothing.

### One-to-one matching

Each label is matched by at most one prediction and each prediction matches at most one label. The scorer walks the labels in the order they are written and gives each one the first unmatched prediction that satisfies its rule. When two predictions both satisfy the same label, the first is a true positive and the second is a false positive.

## Per-case counts

For every case the scorer reports three numbers:

- True positives: the labels that were matched.
- False positives: the scored predictions that matched no label.
- False negatives: the labels that no prediction matched.

A case that the pipeline failed on counts every label as a false negative and scores no prediction. A case that was skipped, because its repository could not be reached, has zero counts and is left out of every total and breakdown. Both still list their pre-existing findings when the pipeline returned any.

## Corpus metrics

The run reports precision, recall and F1 as a micro average: the three counts are summed over all counted cases first, and the ratios are computed from the sums.

- Precision = true positives / (true positives + false positives)
- Recall = true positives / (true positives + false negatives)
- F1 = 2 × precision × recall / (precision + recall)

When a ratio has a zero denominator it is reported as 0. A run with no labels and no predictions has precision, recall and F1 of 0.

### Breakdowns

The same three numbers are reported twice more:

- By detector: the counts are grouped by the detector of each label and each scored prediction, so the breakdown has an entry for every detector that appears in a label or a prediction.
- By category: the counts of each case are grouped by the case's category.

### False positives on clean cases

The run also reports the number of false positives summed over every case whose `isClean` is true. A dependency case that expects nothing, such as a withdrawn advisory or a bump to a fixed version, is clean too and counts here.

### Cost and duration

The run reports the total cost in dollars and the total duration in milliseconds, summed over the completed and failed cases, and the same two numbers per case.

## Reading a score

F1 is the primary score. When two runs have the same F1, the cheaper run wins.

A score says how well this pipeline did on these 54 cases under these rules. It says nothing else. A high F1 on the dev split can be overfit: a prompt tuned until it passes every dev case may have learned the cases, not the task. The test split guards against that, which is why it is never used for tuning. Compare dev to test before trusting an improvement.

A score also does not say whether a finding was reported well. A match is a match on package and advisory, on CWE and lines, or on file and line, and nothing in the score reflects the severity, the summary or the remediation text.

## Running the benchmark

Validate the corpus with:

```
bun run benchmark:validate
```

It loads every case, checks that each one is well formed, prints the counts by category and by split, and exits non-zero naming every case that fails a check. For a synthetic case the check diffs `base/` and `head/` and requires every labeled line range to lie within the lines the head adds, so a label cannot drift away from the change it describes.

A run writes its results under `benchmark/results`:

- `<timestamp>-<label>.json` holds the label, split and time of the run, the repository git sha, the prompt versions and model ids, the advisory snapshot date, whether the LLM cache was used, the score, and every case with its counts, matched pairs, unmatched predictions, pre-existing findings, cost, duration and status.
- `latest-<split>.json` holds the same content for the most recent run of that split.
- Beside each JSON file an HTML page of the same name shows the metrics table, the breakdowns and a per-case table that can be filtered by category, split and status.

Run the pipeline over a split, or both, and print the latest metrics with:

```
bun index.ts benchmark run --split all --label <name>
bun index.ts benchmark show
```

`benchmark run` matches dependencies against `benchmark/fixtures/advisories/advisories.json`, written into a temporary advisory cache for the run. Each case writes its audit log under `runs/<runId>/audit.jsonl`.

## Baseline

The baseline was recorded on 2026-10-16 with this change applied on top of commit `707bdba`, before any tuning: code-review prompt v1 on `anthropic/claude-sonnet-5-5`, summaries on `anthropic/claude-haiku-5-5`, osv-scanner 2.7.0 as the dependency cross-check, and the corpus advisory fixture dated 2026-10-15. Every case completed and none was skipped. The results are `benchmark/results/baseline-dev.json` and `benchmark/results/baseline-test.json`, each with its HTML page.

| Split | Cases | Precision | Recall | F1 | Clean false positives | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| dev | 37 | 0.818 | 0.692 | 0.750 | 1 | $0.4128 |
| test | 17 | 0.875 | 0.636 | 0.737 | 0 | $0.1942 |

By detector, F1 on dev and then test: dependencies 1.000 and 1.000, code review 0.621 and 0.545, secrets 0.800 and 1.000.

The first run started with no cached model responses for the corpus: 86 of its 87 model calls missed the cache. A second run of both splits right after it answered all 84 calls from the cache, cost $0.00 and gave the same counts on every case.

The dev misses and false positives point at the next work. `code-05-hardcoded-credential` cannot be found by the reviewer, because CWE-798 is not on its CWE allowlist. `secrets-01-aws-key-in-config` is missed by the secrets rules. The rest are code review: misses on `code-06`, `code-09`, `code-10` and three real-world cases, and false positives on `code-06`, `code-10`, `real-world-07-ws` and the clean case `clean-05-refactor-moves-vulnerable-code`.

## Measured variance

Anthropic models run at their default temperature, so a run without the cache can differ from the one before it. The dev split was run three times with `--no-cache` on 2026-10-16:

| Run | Precision | Recall | F1 | Code review F1 | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.818 | 0.692 | 0.750 | 0.621 | $0.4113 |
| 2 | 0.810 | 0.654 | 0.723 | 0.571 | $0.4145 |
| 3 | 0.818 | 0.692 | 0.750 | 0.621 | $0.4180 |

F1 has a mean of 0.741, a range of 0.723 to 0.750 and a standard deviation of 0.015. All of the spread comes from one case: run 2 missed `code-01-sql-injection-concatenation`, which the other runs and the baseline found. Dependency and secrets scores did not move. A change to the code-review prompt that moves dev F1 by less than about 0.03 is inside this noise.

