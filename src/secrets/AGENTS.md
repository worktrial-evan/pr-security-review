# secrets module

## Purpose

finds secrets in the lines a pull request adds

## Public API

- `detectSecrets({ changedFiles })` in `detect-secrets.ts`: scans only the added lines of each `ChangedFile` and returns a `SecretFinding` for every credential found, in file, line and rule order
- `secretRules`, `SecretRule`, `genericMinimumValueLength`, `genericMinimumEntropy` in `rules.ts`: the rule table and the limits of the generic rule
- `isAllowlistedValue`, `isAllowlistedFile`, `isAllowlistedLine`, `calculateShannonEntropy` in `allowlist.ts`: the skip checks and the entropy measure

## Inputs and outputs

Reads `ChangedFile` from `pull-request-source.ts` in shared and returns `SecretFinding` from `finding.ts`. A finding holds `ruleId`, `fingerprint` (the first 12 hex characters of the sha256 of the value), `file`, `startLine` and `endLine` set to the added line, a title, the rule's severity and confidence, `isIntroducedByPullRequest` true and an id from `createFindingId` over the file, line, rule id and fingerprint. The module takes no audit sink and emits no audit events.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `detect-secrets.ts`: `detectSecrets` and the line loop, fingerprint and finding construction
- `rules.ts`: the rule table
- `allowlist.ts`: the value, file and line skip checks and the entropy helper
- `detect-secrets.test.ts`: added lines only, allowlists, one finding per value, fingerprints, ids and the value never appearing in a finding
- `rules.test.ts`: one positive and one negative line per rule
- `allowlist.test.ts`: each allowlist check and the entropy measure

## Invariants

- The value and the line text never appear in a finding. Only the fingerprint does.
- Only added lines are scanned. Context and removed lines never produce a finding.
- A value yields at most one finding per line. Rules run in table order, so a specific rule wins over the generic rule, and a skipped value is not reported by a later rule.
- The private key rule matches the `BEGIN ... PRIVATE KEY` line only, so every key of one type on one line shares a fingerprint. The finding id still differs by file and line.
- Output order follows the input: files, then lines, then rules, then matches in the line.
- Allowlist matching is case-insensitive for placeholder words. A fixture is any path with a `fixtures` directory, and an example env file is `.env.*` ending in `example`, `sample` or `template`.

## How to test

`bun test src/secrets` runs the module tests. Tests build credential values from pieces inside the test, so no realistic live key is committed.

### Rules

| Rule id | Matches | Severity | Confidence |
| --- | --- | --- | --- |
| `aws-access-key-id` | AWS access key id with an A3T, AKIA, ASIA, ABIA or ACCA prefix | high | 0.9 |
| `aws-secret-access-key` | a quoted 40-character value assigned to a key with aws and secret or key in its name | critical | 0.8 |
| `github-token` | ghp_, gho_, ghu_, ghs_, ghr_ and github_pat_ tokens | critical | 0.95 |
| `slack-token` | xoxa, xoxb, xoxp, xoxr and xoxs tokens | high | 0.95 |
| `stripe-live-key` | sk_live_ and rk_live_ keys | critical | 0.95 |
| `google-api-key` | AIza keys of 39 characters | high | 0.9 |
| `private-key` | a `BEGIN ... PRIVATE KEY` header line | critical | 0.95 |
| `jwt` | three dot-separated base64url segments with the first two starting eyJ | medium | 0.7 |
| `generic-secret` | a quoted value of 16 or more characters with entropy above 3.5, assigned to a key containing secret, password, token, api_key or apikey | medium | 0.5 |

### How to add a rule

1. Add an entry to `secretRules` in `rules.ts` before `generic-secret`, with a `ruleId`, `title`, `severity`, `confidence`, a global `pattern`, the `valueGroup` that captures the value (0 for the whole match) and `isEntropyChecked`.
2. Add a positive and a negative line for it to `ruleCases` in `rules.test.ts`, with the value built from pieces.
3. Add its row to the table above.

## Known gaps

- Private key bodies on the lines after the header are not scanned.
- No git history scan and no check of a credential against its provider.
- The detector is not wired into the pipeline yet.
