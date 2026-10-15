# cli Specification

## Purpose
Provides the command-line entry point for the pull request security reviewer. In this change it only prints usage, and later changes add the review, benchmark and server commands to it.

## Requirements

### Requirement: Usage on no arguments
Running the entry point with no arguments SHALL print the program name, a one-line description and the usage text, and exit with status 0.

#### Scenario: No arguments
- **WHEN** `bun index.ts` runs with no arguments
- **THEN** stdout holds the usage text and the exit status is 0

### Requirement: Help flag
Running the entry point with `--help` SHALL print the same usage text and exit with status 0.

#### Scenario: Help flag
- **WHEN** `bun index.ts --help` runs
- **THEN** stdout holds the usage text and the exit status is 0

### Requirement: Unknown command
Running the entry point with an argument it does not recognize SHALL print an error naming the argument followed by the usage text, and exit non-zero.

#### Scenario: Unknown command
- **WHEN** `bun index.ts frobnicate` runs
- **THEN** stderr names `frobnicate`, the usage text is printed and the exit status is non-zero
