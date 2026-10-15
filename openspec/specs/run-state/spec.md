# run-state Specification

## Purpose
Tracks where a review run is in its ordered stages and allows only forward transitions, so a run can never skip a stage or report success without completing them all.

## Requirements

### Requirement: Runs start at the first stage
Creating a run state SHALL produce a state at stage `resolving-pull-request` with the given run id, a start time and no completed stages.

#### Scenario: Create
- **WHEN** a run state is created for run `abc`
- **THEN** its stage is `resolving-pull-request`, its runId is `abc`, and its completed stages are empty

### Requirement: Advance moves to the next stage only
Advancing a run state SHALL move it to the stage immediately after its current stage in the order resolving-pull-request, collecting-files, parsing-lockfiles, matching, reachability, secrets, code-review, summarizing, rendering, done, and SHALL record the stage just left with its duration in the completed stages.

#### Scenario: Legal advance
- **WHEN** a state at `matching` is advanced to `reachability`
- **THEN** the new state is at `reachability` and its completed stages end with `matching` and a duration

#### Scenario: Skipping a stage is rejected
- **WHEN** a state at `matching` is advanced to `secrets`
- **THEN** advancing throws a typed illegal-transition error naming both stages, and the input state is unchanged

#### Scenario: Moving backwards is rejected
- **WHEN** a state at `secrets` is advanced to `matching`
- **THEN** advancing throws the typed illegal-transition error

#### Scenario: Done and failed are terminal
- **WHEN** a state at `done` or `failed` is advanced to any stage
- **THEN** advancing throws the typed illegal-transition error

### Requirement: Failed is reachable from any stage
A state at any non-terminal stage SHALL be advanceable to `failed` with an error, and the failed state SHALL include that error.

#### Scenario: Fail early
- **WHEN** a state at `collecting-files` is advanced to `failed` with an error
- **THEN** the new state is at `failed` and includes the error

#### Scenario: Fail without an error is rejected
- **WHEN** a state is advanced to `failed` with no error
- **THEN** advancing throws the typed illegal-transition error

### Requirement: Typed error
The illegal-transition error SHALL be a distinct error class that includes the from and to stages, so callers can catch it apart from other errors.

#### Scenario: Catchable by type
- **WHEN** an illegal advance is attempted inside a try block
- **THEN** the caught error is an instance of the illegal-transition error class with `from` and `to` fields
