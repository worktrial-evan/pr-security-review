# Spec Delta

## Purpose
Runs one pull request review end to end: describes the pull request, collects its files, runs every detector, dedupes and summarizes the findings, and returns a validated review result with a complete audit trail.

## ADDED Requirements

### Requirement: Steps run in order under run-state stages
A review SHALL run these steps in order: describe the pull request, collect changed files, parse lockfiles, load advisories, match dependencies, reachability, secrets, code review, dedupe, summarize and assemble. Every step SHALL run under a run-state stage, the run state SHALL only move forward, and a finished run SHALL end at `done`.

#### Scenario: Every step is audited
- **WHEN** a review runs to the end
- **THEN** the audit log holds a step-start event and a step-end event for every step in that order, each step-start with an input hash and each step-end with an output hash and a duration

#### Scenario: Step durations are recorded
- **WHEN** a review runs to the end
- **THEN** the result metadata has a duration for every step that ran

### Requirement: The result validates
A review SHALL return a result that parses against the shared review result schema, with the run id, start and finish times, the base and head sha, step durations, the total model cost, the advisory snapshot when one was loaded, the prompt versions and model ids used, the grounding rejection count, the suspected prompt injection count and the degraded steps.

#### Scenario: Snapshot review
- **WHEN** a review runs over a snapshot pull request that adds a secret and changes a lockfile, with a fake model provider
- **THEN** the result parses, holds the secret finding with a summary, and names the advisory snapshot

### Requirement: Detector failures degrade the run
When a step after collecting files fails, the review SHALL record a non-fatal step error naming the step, list the step as degraded, continue with the remaining steps and write a step-error event.

#### Scenario: One detector throws
- **WHEN** the secrets detector throws during a review
- **THEN** the result has a non-fatal error for the secrets step, lists secrets as degraded, still runs every later step and still validates

### Requirement: An unreadable pull request aborts the run
When describing the pull request or collecting its files fails, the review SHALL stop, move the run state to failed and return a result with one fatal error and no findings.

#### Scenario: Describe fails
- **WHEN** the pull request source throws while describing the pull request
- **THEN** the result has one fatal error for that step, no findings, and no later step runs

### Requirement: Dependencies are matched and cross-checked
For every changed lockfile the review SHALL match the head dependencies against the advisories and cross-check the result with osv-scanner when it is available. A finding SHALL say whether both matchers, one of them, or only the hand-written matcher with osv-scanner unavailable reported it. When osv-scanner cannot run, the review SHALL keep the hand-written findings and list the matching step as degraded.

#### Scenario: Oracle unavailable
- **WHEN** a pull request changes a lockfile and osv-scanner is not installed
- **THEN** the findings are marked oracle-unavailable and the matching step is degraded

#### Scenario: Both matchers agree
- **WHEN** osv-scanner is installed and reports the same advisory for the same package version
- **THEN** the finding is marked as found by both

### Requirement: Only new advisory exposure is introduced
A dependency finding SHALL be introduced by the pull request only when the head version is in the advisory's range and no version of the same package at base was affected by that advisory or one of its aliases.

#### Scenario: Downgrade inside an existing range
- **WHEN** the head downgrades a package and one advisory covers both the base and the head version
- **THEN** that advisory's finding is pre-existing and the advisories that only cover the head version are introduced

### Requirement: Code review runs at the live prompt version
With the model on, the review SHALL run the code reviewer at the configured or overridden prompt version and record that version and the review model in the metadata. With the model off, code review SHALL be skipped and not degraded. A chunk whose answer failed validation twice SHALL degrade the step.

#### Scenario: Model off
- **WHEN** a review runs with the model off
- **THEN** code review is not degraded and no model call is made

#### Scenario: Counters reach the metadata
- **WHEN** the reviewer drops a finding that is not grounded and reports an injection attempt
- **THEN** the metadata counts one grounding rejection and one suspected prompt injection

### Requirement: Findings are deduped across detectors
A dependency finding SHALL be dropped when an earlier one names the same package, version and advisory from another lockfile. A code-review finding SHALL be dropped when a dependency finding already covers the same package in a manifest or lockfile, or when a secrets finding already covers a line it reports as a hardcoded credential.

#### Scenario: Two lockfiles
- **WHEN** a project keeps both bun.lock and package-lock.json and both install the same vulnerable version
- **THEN** one finding is kept

#### Scenario: Dependency bump reported twice
- **WHEN** code review reports a vulnerable bump of a package in `package.json` and the dependency detector reports the same package
- **THEN** only the dependency finding is kept

### Requirement: Limits against a hostile pull request
The review SHALL read `maxChangedFiles`, `maxFileBytes` and `maxReviewCostUsd` from the review configuration. Files past the file count or over the byte limit SHALL be withheld from secrets and code review and listed under the degraded steps. No review model call SHALL start once the run's model cost reaches `maxReviewCostUsd`. Nothing from the reviewed repository SHALL be installed or executed.

#### Scenario: Too many files
- **WHEN** a pull request changes more files than `maxChangedFiles`
- **THEN** the files past the limit are not scanned and the degraded steps name them

#### Scenario: Cost limit reached
- **WHEN** the run's model cost has reached `maxReviewCostUsd`
- **THEN** the next review model call is refused without reaching the provider

### Requirement: Overlong lines are noted
Added lines the secrets detector skips for length SHALL be written to the audit log as a note naming the file, the line and the length.

#### Scenario: A minified line
- **WHEN** a pull request adds a line of 5,000 characters
- **THEN** the audit log holds a note naming that file and line
