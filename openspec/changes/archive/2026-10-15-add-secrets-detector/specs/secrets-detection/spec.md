# Spec Delta

## Purpose

Finds credentials that a pull request adds and reports where they are with a fingerprint, so a reviewer can act on them without the credential being copied into findings, logs or reports.

## ADDED Requirements

### Requirement: Only added lines are scanned
The detector SHALL scan only the added lines of each changed file and SHALL return findings with detector `secrets`.

#### Scenario: Added line is scanned
- **WHEN** an added line holds a GitHub token
- **THEN** one finding is returned for that file and line

#### Scenario: Unchanged and removed lines are ignored
- **WHEN** a token appears only in a hunk's context or removed lines, not in the added lines
- **THEN** no finding is returned

#### Scenario: Binary or deleted files add nothing
- **WHEN** a changed file has no added lines
- **THEN** no finding is returned for it

### Requirement: Credential categories
The detector SHALL flag AWS access key ids, AWS secret keys, GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), Slack tokens, Stripe live keys, Google API keys, private key blocks and JWTs, and each rule SHALL carry a severity and a confidence.

#### Scenario: Each category matches
- **WHEN** an added line holds a well-formed value of a category
- **THEN** a finding is returned whose rule id names that category

#### Scenario: Near misses do not match
- **WHEN** an added line holds a value with the right prefix but the wrong length or character set
- **THEN** no finding is returned

#### Scenario: Stripe test keys are ignored
- **WHEN** an added line holds a Stripe key with a test prefix
- **THEN** no finding is returned

### Requirement: Generic secret assignment
The detector SHALL flag an assignment whose key contains secret, password, token, api_key or apikey when the value is quoted, is at least 16 characters long and has Shannon entropy above 3.5 bits per character.

#### Scenario: High-entropy value is flagged
- **WHEN** an added line assigns a random 24-character quoted value to a key named `client_secret`
- **THEN** a generic finding is returned

#### Scenario: Short or low-entropy value is not flagged
- **WHEN** the quoted value is under 16 characters or is a repeated pattern such as `aaaaaaaaaaaaaaaaaaaa`
- **THEN** no finding is returned

#### Scenario: One finding per value
- **WHEN** a value matches a specific rule and also the generic rule
- **THEN** one finding is returned and its rule id is the specific rule

### Requirement: Allowlist
The detector SHALL skip a match whose value contains EXAMPLE, xxxx, `<`, placeholder or CHANGEME in any letter case, skip files under test fixtures and example env files, and skip a line that ends in a `secrets-allow` comment.

#### Scenario: Placeholder value
- **WHEN** an added line holds an otherwise valid AWS access key id that contains `EXAMPLE`
- **THEN** no finding is returned

#### Scenario: Fixture and example env files
- **WHEN** a token is added in `test/fixtures/config.ts` or in `.env.example`
- **THEN** no finding is returned

#### Scenario: Marked line
- **WHEN** an added line holds a token and ends with `// secrets-allow`
- **THEN** no finding is returned

### Requirement: The value is never reported
A finding SHALL hold the rule id, a fingerprint of the first 12 hex characters of the sha256 of the value, the file, the line, a title and `isIntroducedByPullRequest` true, and neither the finding nor its JSON SHALL contain the value or any text of the matched line.

#### Scenario: Value absent
- **WHEN** a finding is returned for a token
- **THEN** the token text appears nowhere in the finding or in its JSON serialization

#### Scenario: Equal values, equal fingerprints
- **WHEN** the same value is added on two lines
- **THEN** both findings hold the same fingerprint

### Requirement: Stable finding ids
A finding id SHALL be derived from the detector, file, line, rule id and fingerprint, so the same input always gives the same id and a change to any of them gives a different id.

#### Scenario: Deterministic
- **WHEN** the detector runs twice on the same changed files
- **THEN** both runs return findings with the same ids in the same order

#### Scenario: Different line, different id
- **WHEN** the same value is added on two different lines
- **THEN** the two findings have different ids
