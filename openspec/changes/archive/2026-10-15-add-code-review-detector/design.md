# Design

## Context

`src/code-review` is an empty module that may import shared, llm and prompts. It receives `ChangedFile` values whose hunks already carry `contextLines` of context, with head line numbers on added and context lines and 0 on removed lines. `createLlmClient` validates output against a zod schema, retries once on a schema failure and throws `LlmOutputValidationError` after that. `fenceUntrustedContent` and `describeFence` exist. See proposal.md for the motivation and the assumptions.

## Goals / Non-Goals

**Goals:**
- Every file below has one concern, a fixed signature and its own test, so the groups build in parallel.
- Every decision that shapes the packet text is deterministic, so the snapshot and the LLM cache stay stable.

**Non-Goals:**
- Parallel model calls. Chunks run in order.
- A verifier pass, benchmark-derived examples, or a pipeline step. The pipeline change wires `reviewCode` in.

## Decisions

- **Prompt file is the system prompt.** The rubric, the fence description and the CWE allowlist belong where the model weighs them most, and the user turn then holds untrusted data only. Alternative: rubric in the user prompt with the fence as a variable. Rejected so the two turns separate instructions from data.
- **Allowlist in code, rendered into the prompt.** `cwe-allowlist.ts` is the one list. The prompt declares `{{cwe_allowlist}}` and `{{fence_description}}`. Alternative: list literal in the prompt plus a sync test. Rejected as two copies.
- **Context is capped, not added.** Each hunk keeps at most `contextLines` context lines before its first change and after its last change. Alternative: read head content and widen. Rejected because the source already produces that many context lines.
- **Chunk by rendered line count.** `defaultMaxChunkLines` is 500. Whole hunks fill a chunk in order and an oversized hunk is a chunk alone. Alternative: a character budget. Rejected as harder to reason about in a fixture.
- **Grounding is pure and chunk-local.** `groundFinding` returns a verdict and writes nothing. It checks the chunk's file, then the allowlist, then every evidence line against the file's `addedLines` texts exactly, then the range against the added line numbers. `reviewCode` writes the notes.
- **Dedupe is pure and pairwise.** `dedupeFindings` sorts by file, start line, end line, CWE and descending confidence, then walks the list and drops every finding that any finding with the same file and CWE overlaps with a higher confidence, or that a kept finding overlaps with an equal confidence. A finding beaten on confidence loses even when its rival is dropped, so a broad finding beaten by a narrow one still removes the weak findings under it. An equal-confidence tie is settled only by kept findings, so a chain of equal findings keeps both ends. Alternative: a greedy pass against the kept findings only. Rejected because a low-confidence finding survived once the broad finding it overlapped had been replaced by a narrower one.
- **Packet input is validated.** `assembleReviewPacket` throws on a context line count that is not a nonnegative integer, a chunk limit that is not an integer of at least one, an empty path, a path or previous path with a line break, a hunk line text with a newline, and a path named twice. The pull request source never produces these, and a loud failure beats a chunk grounded against the wrong file or a forged header line. The disabled path returns before the packet is built, so it validates nothing.
- **The allowlist holds only CWEs where the model can name an input or a caller.** The rubric demands a named input, so hard-coded credentials, weak algorithms, cleartext storage and transmission, weak randomness and permission assignment are left out instead of asking the model to invent a source. Missing or incorrect authentication and authorization stay in, because the unauthenticated request is the input.
- **Schema failure is contained per chunk.** `LlmOutputValidationError` is caught, noted and counted. Every other error propagates, because a provider outage is not a model answer.
- **Audit through one helper.** `writeCodeReviewNote` and `writeCodeReviewFinding` in `code-review-audit.ts` stamp the timestamp, run id and step so every event has the same shape.

## File contracts

Every signature below is fixed. A group implements its files against them without reading the other groups' code.

`cwe-allowlist.ts`
- `allowedCwes: readonly { id: string; name: string }[]` as a const tuple, around 30 entries such as `CWE-89` SQL Injection and `CWE-79` Cross-site Scripting
- `isAllowedCwe(cwe: string): boolean`
- `renderCweAllowlist(): string` returns one `CWE-NNN: Name` line per entry, in tuple order

`model-output.ts`
- `modelFindingSchema`, `ModelFinding`: cwe string, title string, severity `severitySchema`, confidence number 0..1, file string, startLine and endLine positive integers, evidence string array with at least one entry, sourceToSink string, remediation string. Each field has a `.describe()` the model sees
- `injectionAttemptSchema`, `InjectionAttempt`: file string, line positive integer
- `codeReviewOutputSchema`, `CodeReviewOutput`: findings array and injectionAttempts array

`skip-rules.ts`
- `skipReasons = ['binary', 'deleted', 'lockfile', 'generated', 'no-added-lines'] as const`, `SkipReason`
- `findSkipReason(changedFile: ChangedFile): SkipReason | null` checked in that order. no-added-lines applies when `addedLines` is empty or no hunk line is added. Lockfile by base name: bun.lock, bun.lockb, package-lock.json, npm-shrinkwrap.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, Gemfile.lock, poetry.lock, composer.lock, Pipfile.lock, go.sum. Generated by path: a segment named node_modules, dist, build, vendor, `__snapshots__` or `__generated__`, or a name ending in .min.js, .min.css, .map, .snap, .pb.go or `_pb2.py`, or containing `.generated.`

`review-packet.ts`
- `defaultMaxChunkLines = 500`
- `AssembleReviewPacketOptions`: changedFiles, contextLines, optional maxChunkLines
- `SkippedFile`: file, reason
- `PacketChunk`: file, chunkNumber starting at 1, chunkCount, text, lineCount
- `ReviewPacket`: hash, chunks, skippedFiles
- `assembleReviewPacket(options): ReviewPacket`
- Chunk text: `file: <path>`, `status: <status>`, `renamed from: <previousPath>` only when set, `chunk: <n> of <count>`, then per hunk a header `@@ +<first head line shown>,<count of shown added and context lines> @@` and one line per hunk line as `<headLine> <marker> <text>` with marker `+`, `-` or a space. Lines joined by `\n`, no trailing newline
- Hash: sha256 hex over the chunk texts joined by `\n`
- Paths compare as code unit strings through `compareStrings`, the order the pull request source uses

`compare-strings.ts`
- `compareStrings({ first, second }): number`: code unit order of two strings, used for paths and CWE ids

`grounding.ts`
- `groundingRejectionReasons = ['file-mismatch', 'cwe-not-allowed', 'evidence-not-added', 'range-not-added'] as const`, `GroundingRejectionReason`
- `GroundFindingOptions`: finding `ModelFinding`, file string, addedLines `AddedLine[]`
- `GroundingVerdict`: `{ kind: 'grounded' } | { kind: 'rejected'; reason: GroundingRejectionReason }`
- `groundFinding(options): GroundingVerdict` in the order above

`dedupe-findings.ts`
- `dedupeFindings(findings: ModelFinding[]): ModelFinding[]`

`review-prompt.ts`
- `codeReviewPromptId = 'code-review'`
- `BuildReviewPromptOptions`: template `PromptTemplate`, chunkText string
- `ReviewPrompt`: system, user, fence `UntrustedFence`
- `buildReviewPrompt(options): ReviewPrompt`: fence the chunk text with label `diff`, render the template with `fence_description` from `describeFence` and `cwe_allowlist` from `renderCweAllowlist`, user is `fence.text`. Throws when the template text does not use both placeholders

`code-review-audit.ts`
- `codeReviewStep = 'code-review'`
- `CodeReviewAuditContext`: auditSink, runId
- `writeCodeReviewNote({ auditSink, runId, payload })`, `writeCodeReviewFinding({ auditSink, runId, finding })`, both `Promise<void>`

`review-chunk.ts`
- `ReviewSession`: template, llmClient, modelId, auditContext, what every chunk of one review shares
- `ChunkReview`: `{ kind: 'reviewed'; groundedFindings; groundingRejectionCount; injectionAttemptCount } | { kind: 'failed' }`
- `reviewChunk({ reviewSession, chunk, addedLines }): Promise<ChunkReview>`: the per-chunk steps of `reviewCode`, split out so each file stays under the size limit

`review-code.ts`
- `ReviewCodeOptions`: changedFiles, llmClient, auditSink, runId, isLlmEnabled, contextLines, modelId, optional promptsDirectory, optional maxChunkLines
- `CodeReviewResult`: findings `CodeReviewFinding[]`, groundingRejectionCount, injectionAttemptCount, failedChunkCount, promptVersion
- `reviewCode(options): Promise<CodeReviewResult>`: load the prompt, write the skip note and return when disabled, assemble the packet and note it, for each chunk build the prompt and call `generate` with `codeReviewOutputSchema` and the model id, note each injection attempt, ground each finding and note each drop, then dedupe, build findings with `createFindingId({ detector: 'code-review', stableKey: file, startLine, endLine and cwe joined by newlines })`, parse each through `codeReviewFindingSchema`, write a finding event each, and return

`fixtures/changed-files.ts`
- `sqlInjectionChangedFile`, `wideContextChangedFile`, `renamedChangedFile`, `binaryChangedFile`, `deletedChangedFile`, `lockfileChangedFile`, `generatedChangedFile`, `removedOnlyChangedFile`: valid `ChangedFile` values, `namedChangedFiles` as that list in declaration order, `buildLargeChangedFile({ hunkCount, linesPerHunk })`, `toAddedLines(hunkLines)` as the added lines of hunk lines, and `testContextLines` as the 30 context lines every test renders at

`fixtures/memory-audit-sink.ts`
- `MemoryAuditSink extends AuditSink` with `events: AuditEvent[]`, `createMemoryAuditSink(): MemoryAuditSink`

`fixtures/model-findings.ts`
- `sqlInjectionModelFinding`: a `ModelFinding` grounded in the second added line of `sqlInjectionChangedFile`, spread with overrides where a test needs a variant

`fixtures/fenced-content.ts`
- `readFencedContent({ text, openTag, closeTag }): string`: the text between the open tag plus newline and newline plus close tag, for the tests that check a request's user turn

`fixtures/review-harness.ts`
- `runReview({ changedFiles, replies, isLlmEnabled?, contextLines?, maxChunkLines?, clientModelId?, reviewModelId? })`: builds the llm client on the fake provider with a zero-priced model, the memory audit sink and a fixed run id, runs `reviewCode` and returns `{ codeReviewResult, provider, auditSink }` for the review tests

Test files beside the ones named per group: `fixtures/changed-files.test.ts` checks every fixture parses and lists its added lines, `review-packet-validation.test.ts` and `review-packet-chunking.test.ts` hold the validation and chunking cases of the packet, `review-code-answers.test.ts` holds the injection, grounding, dedupe and validation failure cases of `reviewCode`, and `prompt-examples.test.ts` parses every worked example of the prompt, re-renders its chunk through `assembleReviewPacket` byte for byte, validates its JSON through `codeReviewOutputSchema` and grounds every finding in it. Its parser accepts exactly the packet format: a removed line shows 0 and every other line a positive head line, a new hunk starts at each `@@` line, and a `renamed from:` header sets the previous path.

Audit payloads, all under step `code-review`: the skip note `{ message: 'code review skipped because the llm is disabled' }`, the packet note `{ message: 'review packet assembled', packetHash, chunkCount, skippedFiles }`, the grounding note `{ message: 'finding rejected by grounding', reason, file, cwe, title, startLine, endLine, chunkFile, chunkNumber }`, the injection note `{ message: 'injection attempt', file, line }`, the failed chunk note `{ message: 'chunk skipped after output validation failure', file, chunkNumber, error }`, and the finding event `{ finding }`.

## Risks / Trade-offs

- [The model trims whitespace in evidence] → The rubric says to copy lines exactly. A trimmed line is dropped and audited, and the rejection count shows how often it happens.
- [A big file becomes several chunks that each miss the whole picture] → Dedupe collapses repeats, and the chunk header tells the model it sees part of a file.
- [An injection in the diff asks the model to report an attempt that is not there] → An attempt is only an audit note and a count. It never becomes a finding.
- [Sequential chunk calls are slow on a large pull request] → The cache makes reruns free, and the pipeline can parallelize later without changing the packet.
