# Tasks

## 1. Module contracts

- [x] 1.1 Create `src/code-review/cwe-allowlist.ts` with `allowedCwes`, `isAllowedCwe` and `renderCweAllowlist`, and `cwe-allowlist.test.ts` covering unique ids, an allowed and a rejected id, and one rendered line per entry. Verify with `bun test src/code-review/cwe-allowlist.test.ts`
- [x] 1.2 Create `src/code-review/model-output.ts` with `modelFindingSchema`, `injectionAttemptSchema` and `codeReviewOutputSchema`, and `model-output.test.ts` covering a round trip, empty evidence rejected, an unknown severity rejected and a non-positive line rejected. Verify with `bun test src/code-review/model-output.test.ts`

## 2. Packet assembly

- [x] 2.1 Create `src/code-review/skip-rules.ts` with `skipReasons` and `findSkipReason`, and `skip-rules.test.ts` covering each reason, the order of the checks and a plain source file returning null. Verify with `bun test src/code-review/skip-rules.test.ts`
- [x] 2.2 Create `src/code-review/fixtures/changed-files.ts` with the named sample changed files and `buildLargeChangedFile`, each passing `changedFileSchema`. Verify with `bun check src/code-review/fixtures/changed-files.ts`
- [x] 2.3 Create `src/code-review/review-packet.ts` with `assembleReviewPacket`, the chunk text format, the context cap, chunking and the hash. Verify with `bun check src/code-review/review-packet.ts`
- [x] 2.4 Create `src/code-review/review-packet.test.ts` covering the packet snapshot, files sorted by path, every skip reason, the context cap at 30, every line numbered with its marker, the large fixture split into two chunks on hunk boundaries, an oversized hunk alone, and the hash changing with one added line. Verify with `bun test src/code-review/review-packet.test.ts`

## 3. Grounding and dedupe

- [x] 3.1 Create `src/code-review/grounding.ts` with `groundFinding`, and `grounding.test.ts` covering a grounded finding, a fabricated evidence line, a trimmed evidence line, a range on context lines only, a CWE outside the allowlist, another file, and the order of the reasons. Verify with `bun test src/code-review/grounding.test.ts`
- [x] 3.2 Create `src/code-review/dedupe-findings.ts` with `dedupeFindings`, and `dedupe-findings.test.ts` covering overlapping same file and CWE keeping the higher confidence, a different CWE kept, a non-overlapping range kept, a different file kept, and the output order. Verify with `bun test src/code-review/dedupe-findings.test.ts`

## 4. Prompt

- [x] 4.1 Create `prompts/code-review/v1.md` with the frontmatter, the rubric, the severity definitions, the `{{cwe_allowlist}}` and `{{fence_description}}` placeholders, the packet format, the output rules and three worked examples. Verify with `bun test src/prompts/prompt-files.test.ts`
- [x] 4.2 Create `src/code-review/review-prompt.ts` with `codeReviewPromptId` and `buildReviewPrompt`, and `review-prompt.test.ts` covering the user text equal to the fence text with the chunk byte for byte inside, the system text holding the fence description and every allowed CWE id, and the loaded v1 prompt rendering. Verify with `bun test src/code-review/review-prompt.test.ts`

## 5. Review orchestration

- [x] 5.1 Create `src/code-review/fixtures/memory-audit-sink.ts` with `createMemoryAuditSink` and `src/code-review/code-review-audit.ts` with `codeReviewStep`, `writeCodeReviewNote` and `writeCodeReviewFinding`, with `code-review-audit.test.ts` checking both events parse through `auditEventSchema` with the step and kind. Verify with `bun test src/code-review/code-review-audit.test.ts`
- [x] 5.2 Create `src/code-review/review-code.ts` with `reviewCode` following the flow in design.md. Verify with `bun check src/code-review/review-code.ts`
- [x] 5.3 Create `src/code-review/review-code.test.ts` against the fake provider covering the disabled run with its note and no request, one request per chunk in packet order, the user text equal to the fence of the chunk text byte for byte and the system text describing it, injection attempts becoming notes with the count, a fabricated evidence line and an out-of-range finding dropped with notes and the count, a CWE outside the allowlist dropped, a duplicate across two chunks collapsed to the higher confidence, the schema failure path skipping one chunk and keeping the other, the finding shape with promptVersion, model, detector and a stable id, and the packet note and finding events. Verify with `bun test src/code-review/review-code.test.ts`

## 6. Close out

- [x] 6.1 `bun run verify` passes
- [x] 6.2 `src/code-review/AGENTS.md` updated: every export under Public API, the packet format and the grounding rules under Invariants, every file under Files, the test command under How to test, and the verifier pass and benchmark examples under Known gaps. Verify by reading the file against `docs/agents-template.md`
