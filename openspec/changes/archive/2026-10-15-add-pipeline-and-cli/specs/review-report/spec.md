# Spec Delta

## MODIFIED Requirements

### Requirement: Run header
The report header SHALL show when the run started, the pull request url and title, the base and head sha, the run id, the duration, the total cost in USD, the advisory snapshot date, each prompt id with its version, each model id, the suspected prompt injection count, and a dash for any value the result does not have.

#### Scenario: Header values
- **WHEN** the fixture result is rendered
- **THEN** the header contains its run id, both shas, its cost, every prompt id with its version, every model id and the suspected prompt injection count

#### Scenario: Missing snapshot
- **WHEN** a result has no advisory snapshot
- **THEN** the snapshot date shows a dash
