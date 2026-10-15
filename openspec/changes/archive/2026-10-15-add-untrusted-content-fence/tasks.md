# Tasks

## 1. Fence function

- [x] 1.1 Create `src/prompts/fence-untrusted.ts` with the one-line header, the label check, the nonce loop and `fenceUntrustedContent({ label, content })` returning `{ label, nonce, openTag, closeTag, text }`. Verify with `bun check src/prompts/fence-untrusted.ts`
- [x] 1.2 Create `src/prompts/fence-untrusted.test.ts` covering the same input giving the same nonce, a one-character change giving a different nonce, an invalid label throwing, and the tag and text shape. Verify with `bun test src/prompts/fence-untrusted.test.ts`
- [x] 1.3 Add tests for content that contains its computed nonce forcing a rehash, a forged closing tag without the nonce and one with a guessed nonce staying inside the fence, content byte-identical for trailing whitespace, CRLF and an empty string, and two fences with their own nonces. Verify with `bun test src/prompts/fence-untrusted.test.ts`

## 2. Fence description and renderer

- [x] 2.1 Add `describeFence(fence)` returning the system prompt sentence with the tags and the data-not-instructions statement, with a test for the tags and the statement. Verify with `bun test src/prompts/fence-untrusted.test.ts`
- [x] 2.2 Add a test that fenced text passed to `renderPrompt` as a variable value keeps a `{{placeholder}}` in it literal. Verify with `bun test src/prompts/fence-untrusted.test.ts`

## 3. Close out

- [x] 3.1 `bun run verify` passes
- [x] 3.2 `src/prompts/AGENTS.md` updated: both functions under Public API, the nonce rule and why it is not random under Invariants, and the two new files under Files. Verify by reading the file against `docs/agents-template.md`
