# Spec Delta

## Purpose

Records what every review run did as an append-only JSONL log under `runs/<runId>/`, so a run can be replayed and audited later, with secret-like values replaced by fingerprints before they ever reach disk.

## ADDED Requirements

### Requirement: One JSONL file per run
The audit sink SHALL write events for a run to `runs/<runId>/audit.jsonl`, creating the directory when it does not exist, with exactly one JSON object per line and no trailing partial line.

#### Scenario: Events become lines
- **WHEN** three events are written through the sink for run `abc`
- **THEN** `runs/abc/audit.jsonl` contains exactly three lines and each line parses as JSON into an audit event that passes the audit contract

#### Scenario: Directory is created
- **WHEN** the first event for a run is written and `runs/<runId>/` does not exist
- **THEN** the directory is created and the file holds that event

### Requirement: Flush per write
Every write SHALL be durable on disk before the write call resolves, so a process that crashes after a write never loses that event.

#### Scenario: Line visible after write resolves
- **WHEN** a write call resolves
- **THEN** reading the file immediately afterwards returns that event as its last line

### Requirement: Secret-like values are redacted
Before writing, the sink SHALL replace every secret-like string value anywhere in the event payload with a SHA-256 fingerprint, so the log never holds a usable secret but equal secrets map to equal fingerprints. A value is secret-like when it matches a known token shape (such as GitHub, Anthropic, AWS or generic API key prefixes) or sits under a key whose name suggests a secret (such as token, secret, password, apiKey, authorization).

#### Scenario: Fake token is replaced
- **WHEN** a payload includes `{ "headers": { "authorization": "Bearer ghp_abc123..." } }`
- **THEN** the written line does not contain the token text and holds a fingerprint of a fixed hex length in its place

#### Scenario: Equal secrets, equal fingerprints
- **WHEN** the same token value appears in two events
- **THEN** both written lines hold the same fingerprint

#### Scenario: Ordinary values are untouched
- **WHEN** a payload holds a file path, a package name and a line number
- **THEN** the written line holds them unchanged

### Requirement: Redaction is pure and reusable
The redaction SHALL be exposed as a function that returns a redacted copy of a payload without mutating its input, so other modules can redact before logging or rendering.

#### Scenario: Input not mutated
- **WHEN** a payload with a secret is redacted
- **THEN** the original object still holds the secret and the returned object holds the fingerprint
