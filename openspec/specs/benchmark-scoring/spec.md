# benchmark-scoring Specification

## Purpose
Decides, by explicit rules, which predicted findings match which expected findings, and turns the matches into the precision, recall and F1 a benchmark run reports.

## Requirements

### Requirement: Only introduced findings are scored
The scorer SHALL score only predicted findings whose `isIntroducedByPullRequest` is true. Findings with it false SHALL be listed separately as pre-existing and SHALL never count as true or false positives.

#### Scenario: Pre-existing finding is excluded
- **WHEN** a case expects nothing and the pipeline returns one finding with `isIntroducedByPullRequest` false
- **THEN** the case has zero false positives and the finding appears in the case's pre-existing list

### Requirement: Dependency match rule
A predicted sca finding SHALL match an expected sca finding when the package names are equal and the expected advisory id equals the predicted advisory id or any of its aliases.

#### Scenario: Alias matches
- **WHEN** the expected advisory id is a CVE id and the predicted finding has a GHSA id with that CVE among its aliases
- **THEN** the two match

#### Scenario: Package differs
- **WHEN** the advisory ids are equal but the package names differ
- **THEN** the two do not match

### Requirement: Code match rule
A predicted code-review finding SHALL match an expected code-review finding when both name the same file, the CWEs are equal or in the same family, and the line ranges overlap after widening each by 5 lines. The families SHALL be CWE-79 with CWE-80 and CWE-22 with CWE-23. An expected finding with no file SHALL match on CWE family alone.

#### Scenario: Same family
- **WHEN** the expected CWE is CWE-79 and the predicted CWE is CWE-80 in the same file with overlapping lines
- **THEN** the two match

#### Scenario: Within tolerance
- **WHEN** the expected range is lines 40 to 42 and the predicted range is lines 46 to 47 in the same file with the same CWE
- **THEN** the two match

#### Scenario: Outside tolerance
- **WHEN** the expected range is lines 40 to 42 and the predicted range is lines 48 to 49
- **THEN** the two do not match

#### Scenario: Different file
- **WHEN** the CWE and lines match but the files differ
- **THEN** the two do not match

### Requirement: Secret match rule
A predicted secrets finding SHALL match an expected secrets finding when the files are equal and the predicted start line is within 2 lines of the expected start line.

#### Scenario: Within two lines
- **WHEN** the expected line is 7 and the predicted line is 9 in the same file
- **THEN** the two match

#### Scenario: Three lines away
- **WHEN** the expected line is 7 and the predicted line is 10
- **THEN** the two do not match

### Requirement: One-to-one matching
Each expected finding SHALL be matched by at most one predicted finding and each predicted finding SHALL match at most one expected finding. Detectors SHALL match before any other rule applies.

#### Scenario: Duplicate predictions
- **WHEN** one expected finding is met by two predicted findings that both satisfy the rule
- **THEN** the case has one true positive and one false positive

#### Scenario: Detector mismatch
- **WHEN** an expected sca finding and a predicted code-review finding share a file and lines
- **THEN** they do not match

### Requirement: Per-case counts
For each case the scorer SHALL report true positives (matched pairs), false positives (scored predictions with no match) and false negatives (expected findings with no match).

#### Scenario: Clean case with a prediction
- **WHEN** a clean case receives one introduced finding
- **THEN** the case has one false positive, zero true positives and zero false negatives

#### Scenario: Missed finding
- **WHEN** a case expects one finding and receives none
- **THEN** the case has one false negative

### Requirement: Corpus metrics
The scorer SHALL micro-average precision, recall and F1 over the summed counts of all cases, SHALL report the same triple by detector and by category, SHALL count false positives on clean cases, and SHALL total cost and duration over the run and per case. A triple with no predictions or no expectations SHALL report 0 for the undefined ratio.

#### Scenario: Micro average
- **WHEN** two cases have 2 and 0 true positives, 1 and 1 false positives, and 0 and 1 false negatives
- **THEN** precision is 2/4, recall is 2/3 and F1 is their harmonic mean

#### Scenario: Zero division
- **WHEN** no case has any expected finding and no case has any prediction
- **THEN** precision, recall and F1 are all 0

#### Scenario: Breakdown keys
- **WHEN** a run holds cases of the categories sca and clean and predictions of the detectors sca and secrets
- **THEN** the by-category breakdown has entries for sca and clean and the by-detector breakdown has entries for sca and secrets

### Requirement: Score is pure and documented
The scorer SHALL be a pure function of the cases, their predicted findings and their cost and duration, with no file or network access. Every rule above, where the labels come from, and what the primary score and tiebreak mean SHALL be written in `docs/benchmark.md` in plain language.

#### Scenario: Documentation names every rule
- **WHEN** `docs/benchmark.md` is read
- **THEN** it describes the dependency, code, secret and one-to-one rules, the pre-existing exclusion, the micro average, the clean false positive count, F1 as the primary score and cost as the tiebreak
