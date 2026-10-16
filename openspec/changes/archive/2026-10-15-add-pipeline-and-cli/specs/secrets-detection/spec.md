# Spec Delta

## ADDED Requirements

### Requirement: Overlong lines are skipped
The detector SHALL skip added lines longer than 4,000 characters and SHALL list each skipped line with its file, line number and length.

#### Scenario: A minified line
- **WHEN** an added line of 5,000 characters holds a GitHub token
- **THEN** no finding is returned for it and the line is listed as skipped
