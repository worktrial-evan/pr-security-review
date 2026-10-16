# Spec Delta

## MODIFIED Requirements

### Requirement: Limits against a hostile pull request
The review SHALL read `maxChangedFiles`, `maxFileBytes` and `maxReviewCostUsd` from the review configuration. Files past the file count or over the byte limit SHALL be withheld from secrets and code review and listed under the degraded steps. No review model call SHALL start once the run's model cost reaches `maxReviewCostUsd`. When the limit stops code review, the findings of the files already reviewed SHALL be kept and the files not reviewed SHALL be listed under the degraded steps. A model call that ends in a validation error SHALL add its usage to the run's cost. Nothing from the reviewed repository SHALL be installed or executed.

#### Scenario: Too many files
- **WHEN** a pull request changes more files than `maxChangedFiles`
- **THEN** the files past the limit are not scanned and the degraded steps name them

#### Scenario: Cost limit reached
- **WHEN** the run's model cost has reached `maxReviewCostUsd`
- **THEN** the next review model call is refused without reaching the provider

#### Scenario: Cost limit stops the review midway
- **WHEN** the limit is reached after the second of four reviewed files
- **THEN** the findings of the first two files are in the result and the degraded steps name the last two files

#### Scenario: Off-schema answers are metered
- **WHEN** a review call's answer fails validation twice and the reviewer gives up on the chunk
- **THEN** the cost of both answers is added to the run's total

## ADDED Requirements

### Requirement: A cancelled run ends with a note
When the caller cancels a run with a signal name, the review SHALL move the run state to failed with the error `cancelled by <signal>`, write one note event with `status: cancelled`, the signal and the stage reached, write nothing after it, and start no further step. A log that ends without a `run finished`, `run aborted` or `run cancelled` note means the process was killed outright.

#### Scenario: Cancelled during secrets
- **WHEN** the run is cancelled while the secrets step is running
- **THEN** the run state is failed with the error `cancelled by SIGINT`, the last event is the cancelled note naming stage `secrets`, and the code-review step never starts

#### Scenario: Cancelled after the run ended
- **WHEN** the run is cancelled after the `run finished` note
- **THEN** nothing more is written
