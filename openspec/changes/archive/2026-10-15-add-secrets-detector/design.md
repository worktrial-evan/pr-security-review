# Design

## Context

`src/secrets` may import `shared` only, and the contracts it needs already exist: `ChangedFile` with `addedLines`, `SecretFinding` and `createFindingId`. The module must be a pure function of its input so benchmark runs are repeatable. See proposal.md for the assumptions taken on severity, matching order and allowlist shapes.

## Goals / Non-Goals

**Goals:**

- Adding a rule is one entry in a table and one pair of tests.
- Nothing derived from the matched text except the fingerprint leaves the module.

**Non-Goals:**

- No git history scan, no multi-line private key body detection and no verification of a credential against its provider.
- No audit events and no configuration file for rules.

## Decisions

### D1. Rules are data, the matcher is generic

`rules.ts` exports a list of `{ ruleId, title, severity, confidence, pattern, valueGroup, isEntropyChecked }`. A rule's pattern is a global regular expression and `valueGroup` names the capture that is the value, or 0 for the whole match. The generic rule is the last entry and the only one with an entropy check. A table keeps "how to add a rule" to one edit, where a function per rule would spread it across files.

### D2. Three files, one concern each

`detect-secrets.ts` holds `detectSecrets` and the line loop, `rules.ts` the table and `allowlist.ts` the skip checks and the entropy helper. The allowlist is a separate file because its checks run at two levels, per file and per value, and both change independently of the rules.

### D3. Order of checks per line

Skip the whole file if its path is allowlisted. For each added line, skip it if it ends in `secrets-allow`. Then run the rules in table order, skip a match whose value is allowlisted or fails its entropy check, and stop after the first rule that yields a finding for a given value. Checking the cheap file and line skips first keeps large pull requests fast.

### D4. Fingerprint and id

The fingerprint is `sha256(value)` as hex, first 12 characters, through `Bun.CryptoHasher`. The finding id is `createFindingId` with the stable key `file`, `line`, `ruleId` and `fingerprint` joined by newlines. The title names the rule and the file, never the line text.

## Risks / Trade-offs

- [A regular expression misses a token shape] → The table is easy to extend and the benchmark's secrets cases surface misses.
- [Entropy 3.5 drops a real but patterned secret, or keeps a long random identifier] → The generic rule has the lowest confidence and severity, so the report ranks it last.
- [The private key fingerprint is the same for every key of one type] → The id still differs by file and line, so findings stay distinct.
