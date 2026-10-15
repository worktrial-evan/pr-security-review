# Spec Delta

## ADDED Requirements

### Requirement: Package names stay exact
The system SHALL record every package under the exact name the lockfile installs it as, with its case unchanged. Two names that differ only in case SHALL stay two separate packages.

#### Scenario: Names that differ only in case
- **WHEN** a package-lock.json installs both `JSONStream` and `jsonstream`
- **THEN** the dependency set lists both names, each with its own version
