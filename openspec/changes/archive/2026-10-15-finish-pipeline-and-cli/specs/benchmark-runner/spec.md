# Spec Delta

## ADDED Requirements

### Requirement: A cancelled run writes no results
When the caller aborts a run, the runner SHALL start no further case and write no results file, and the run SHALL end with the abort reason.

#### Scenario: Aborted between cases
- **WHEN** the run is aborted after the first case
- **THEN** the second case never starts and no results file is written

### Requirement: Clones use the GitHub token
When a token is given, the runner SHALL pass it to every clone and fetch of a git case as an authorization header for github.com, never on git's command line.

#### Scenario: Token given
- **WHEN** a git case is cloned with a token
- **THEN** git receives the token through its environment and the command line holds none of it
