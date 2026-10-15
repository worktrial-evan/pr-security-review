# benchmark-runner Specification

## Purpose
Runs any review pipeline over the benchmark corpus offline, scores the result, and writes the results files and page a person compares runs with.

## Requirements

### Requirement: Run a pipeline over a split
The runner SHALL take a review pipeline, a split, a label and options, SHALL run the pipeline on every case of that split in sorted id order with `isOffline` true and the pinned advisory fixture as the advisory cache, and SHALL score the results with the scorer.

#### Scenario: Stub pipeline over three cases
- **WHEN** the runner is given a stub pipeline that returns canned findings and a split holding three snapshot cases
- **THEN** the pipeline is called three times, in sorted id order, with a pull request source for each case and review options whose `isOffline` is true, and the run's score counts the canned findings against the labels

#### Scenario: Pipeline failure on one case
- **WHEN** the pipeline throws on one case
- **THEN** that case is recorded as failed with the error message, counts as missing every expected finding, and the other cases still run

### Requirement: Snapshot source
For a snapshot case the runner SHALL build a pull request source over the case's `base/` and `head/` directories whose changed files, hunks and added lines come from the difference between the two trees, whose file reads return the file at either revision or null, and whose head checkout is the `head/` directory.

#### Scenario: Added and modified files
- **WHEN** head adds one file and changes one line of another
- **THEN** the changed files list has one added file with every line as an added line and one modified file with one added line at its head line number

#### Scenario: Missing file reads null
- **WHEN** a file exists only in head
- **THEN** reading it at base returns null and reading it at head returns its text

### Requirement: Git source and offline skip
For a git case the runner SHALL clone the repository once into `benchmark-repos` under the shared cache directory and build a pull request source over the two shas from that clone. When the clone fails because the network is unavailable, the runner SHALL skip the case with a warning, record it as skipped, and leave it out of the score.

#### Scenario: Local repository
- **WHEN** a git case points at a repository on the local disk with two commits
- **THEN** the source lists the files the second commit changed and the clone lives under the cache directory

#### Scenario: Clone reused
- **WHEN** the same repository is cloned for a second case or a second run
- **THEN** no second clone is made

#### Scenario: Offline
- **WHEN** the repository cannot be reached
- **THEN** the case is skipped with a warning naming it and the score excludes it

### Requirement: Results files
The runner SHALL write `benchmark/results/<timestamp>-<label>.json` and `latest-<split>.json` with the same content: the label, split and time, the repository git sha, the prompt versions, model ids and advisory snapshot date the pipelines reported, whether the LLM cache was used, the score, and per case its id, category, counts, matched pairs, unmatched predictions, pre-existing findings, cost, duration and status.

#### Scenario: Two files, same content
- **WHEN** a run finishes
- **THEN** both files exist in the results directory and parse to equal JSON

#### Scenario: Provenance recorded
- **WHEN** a results file is read
- **THEN** it holds the git sha, the prompt versions, the model ids, the advisory snapshot date and the cache flag

### Requirement: Results page
The runner SHALL write a results HTML page next to the JSON with the metrics table (overall, by detector and by category) and a per-case table that can be filtered by category, split and status in the browser.

#### Scenario: Page holds every case
- **WHEN** the page is written for a run of three cases
- **THEN** it holds a row per case and the overall precision, recall and F1
