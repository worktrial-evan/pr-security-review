# Tasks

## 1. Allowlist and entropy

- [x] 1.1 Write `src/secrets/allowlist.ts` with the value, file and line checks and a Shannon entropy helper, and `src/secrets/allowlist.test.ts` covering each placeholder word in mixed case, fixture and example env paths, the `secrets-allow` line ending and entropy of a repeated versus a random string, and verify `bun test src/secrets/allowlist.test.ts` passes

## 2. Rules

- [x] 2.1 Write `src/secrets/rules.ts` with the rule table for the nine categories and the generic rule, each with a severity and a confidence, and `src/secrets/rules.test.ts` with one positive and one negative case per rule using values assembled inside the test, and verify `bun test src/secrets/rules.test.ts` passes

## 3. Detector

- [x] 3.1 Write `src/secrets/detect-secrets.ts` with `detectSecrets`, the fingerprint and the stable id, and `src/secrets/detect-secrets.test.ts` covering added lines only, the file and line allowlists, one finding per value, equal fingerprints, different ids per line, deterministic order, and an assertion that the token appears nowhere in the finding or its `JSON.stringify`, and verify `bun test src/secrets` passes and `bun check` reports no error
- [x] 3.2 Check every finding returned by the detector parses with `findingSchema` in a test, and verify `bun test src/secrets/detect-secrets.test.ts` passes

## 4. Final verification

- [x] 4.1 bun run verify passes
- [x] 4.2 module AGENTS.md updated: `src/secrets/AGENTS.md` lists the public API, files, every rule with its severity and confidence, the invariants and how to add a rule, and verify it names every file in `src/secrets`

## Workflow follow-up

- Stage finished files as they are completed, and make one commit when `bun run verify` passes, as the session brief allows.
- Archive the change only when the user asks.
