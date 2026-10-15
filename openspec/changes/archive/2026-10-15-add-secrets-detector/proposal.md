# Proposal

## Why

The pipeline has a secrets stage but the `secrets` module is empty, so a pull request that commits a credential passes review. The detector must be deterministic and must never put the credential itself into a finding, a log or a report.

## What Changes

- Add `detectSecrets({ changedFiles })` in `src/secrets`, which scans only `ChangedFile.addedLines` and returns `SecretFinding` values with detector `secrets`.
- Add a rule table in `src/secrets/rules.ts` modeled on the public gitleaks categories: AWS access key id and secret key, GitHub tokens, Slack tokens, Stripe live keys, Google API keys, private key blocks, JWTs and a generic assignment rule gated by length and entropy.
- Add an allowlist for placeholder values, test fixture files, example env files and lines marked `secrets-allow`.
- Report each finding with a 12-hex sha256 fingerprint of the value and a stable id, and never the value.
- Fill in `src/secrets/AGENTS.md` with the rule list and how to add a rule.

Assumptions taken for details the brief leaves open:

- Severity and confidence are fixed per rule: critical for AWS secret keys, GitHub tokens, Stripe live keys and private keys, high for the AWS key id, Slack tokens and Google API keys, medium for JWTs and the generic rule. Confidence runs from 0.5 for the generic rule to 0.95 for prefix-anchored tokens.
- One finding per value per line. Specific rules run before the generic rule, and the first match wins.
- A private key block is detected on its `BEGIN ... PRIVATE KEY` line only, and that line is the fingerprinted value.
- A finding sets `startLine` and `endLine` to the added line number.
- The module takes no audit sink and emits no audit events. The pipeline records findings, which already hold no value.
- Allowlist matching is case-insensitive. A fixture file is any path with a `fixtures` directory, and an example env file is a `.env.*` file ending in `example`, `sample` or `template`.

## Capabilities

### New Capabilities

- `secrets-detection`: finding credentials on the lines a pull request adds, with fingerprints instead of values.

### Modified Capabilities

None.

## Impact

- New files only under `src/secrets/`: `detect-secrets.ts`, `rules.ts`, `allowlist.ts`, their tests, and an updated `AGENTS.md`.
- No dependency, shared contract, matrix or frozen file changes. The module imports `shared` only.
- The pipeline wires the detector in a later change.
