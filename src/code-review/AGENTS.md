# code-review module

## Purpose

LLM code review of the diff for security issues, grounded in evidence: the changed files become a deterministic packet, each chunk goes to the model inside an untrusted-content fence, and only findings whose evidence is in the added lines come back.

## Public API

### review-code.ts

- `reviewCode({ changedFiles, llmClient, auditSink, runId, isLlmEnabled, contextLines, modelId, promptVersion, promptsDirectory, maxChunkLines })`: reviews the changed files and returns a `CodeReviewResult`. `promptVersion` picks the prompt file and defaults to the highest version present. `promptsDirectory` defaults to the repository's `prompts/`, `maxChunkLines` to `defaultMaxChunkLines`
- `ReviewCodeOptions`: the options `reviewCode` takes
- `CodeReviewResult`: `findings` as `CodeReviewFinding[]`, `groundingRejectionCount`, `injectionAttemptCount`, `failedChunkCount` and `promptVersion`

### review-chunk.ts

- `reviewChunk({ reviewSession, chunk, addedLines })`: asks the model about one chunk, notes its injection attempts and returns a `ChunkReview`
- `ReviewSession`: the template, llm client, model id and audit context every chunk of one review shares
- `ReviewChunkOptions`: the options `reviewChunk` takes
- `ChunkReview`: `{ kind: 'reviewed', groundedFindings, groundingRejectionCount, injectionAttemptCount }` or `{ kind: 'failed' }` when the answer failed the schema twice

### review-packet.ts

- `assembleReviewPacket({ changedFiles, contextLines, maxChunkLines })`: returns the `ReviewPacket` for the changed files. Throws when `contextLines` is not a nonnegative integer, when `maxChunkLines` is not an integer of at least 1, when a path is empty or a path or previous path holds a line break, when a hunk line text holds a newline, or when a path is named twice
- `AssembleReviewPacketOptions`: the options it takes
- `ReviewPacket`: `hash`, `chunks` and `skippedFiles`
- `PacketChunk`: `file`, `chunkNumber` from 1, `chunkCount`, `text` and `lineCount`, the hunk lines without their headers
- `SkippedFile`: `file` and `reason`
- `defaultMaxChunkLines`: 500, the rendered hunk lines a chunk is filled up to. A single hunk larger than that is still one chunk
- `renderedHunkLinePattern`: the shape of one rendered hunk line, capturing the head line, the marker and the text, for the tests that read a packet back

### skip-rules.ts

- `findSkipReason(changedFile)`: returns why a file stays out of the packet, or null when it is reviewed
- `skipReasons`, `SkipReason`: binary, deleted, lockfile, generated, no-added-lines, in check order

### review-prompt.ts

- `buildReviewPrompt({ template, chunkText })`: returns a `ReviewPrompt` with the rubric rendered as the system turn and the fenced chunk as the user turn. Throws when the template text does not use both the `fence_description` and the `vulnerability_type_allowlist` placeholder
- `BuildReviewPromptOptions`, `ReviewPrompt`: the options and the `{ system, user, fence }` result
- `codeReviewPromptId`: `code-review`, the prompt id under `prompts/`
- `codeReviewFenceLabel`: `diff`, the label of the fence around a chunk

### model-output.ts

- `codeReviewOutputSchema`, `CodeReviewOutput`: one model answer, `findings` and `injectionAttempts`
- `modelFindingSchema`, `ModelFinding`: vulnerabilityType, title, severity, confidence in 0..1, file, startLine, endLine, evidence with at least one line, sourceToSink, remediation. vulnerabilityType is a plain string so an unknown id reaches the grounding filter instead of failing the schema
- `injectionAttemptSchema`, `InjectionAttempt`: file and line

### vulnerability-type-allowlist.ts

- `allowedVulnerabilityTypes`: the const tuple of `{ id, name }` the reviewer may report, 22 entries from CWE-20 to CWE-1333, each a class where the model can name an input or a caller
- `isAllowedVulnerabilityType(vulnerabilityType)`: whether an id is on the list, by exact string
- `renderVulnerabilityTypeAllowlist()`: one `CWE-NNN: Name` line per entry, rendered into the prompt

### grounding.ts

- `groundFinding({ finding, file, addedLines })`: returns a `GroundingVerdict`
- `GroundFindingOptions`: the options it takes
- `GroundingVerdict`: `{ kind: 'grounded' }` or `{ kind: 'rejected', reason }`
- `groundingRejectionReasons`, `GroundingRejectionReason`: file-mismatch, vulnerability-type-not-allowed, evidence-not-added, range-not-added, in check order

### dedupe-findings.ts

- `dedupeFindings(findings)`: drops every model finding that another finding with the same file and CWE overlaps with a higher confidence, or that a kept finding overlaps with an equal confidence, and orders the rest by file, start line, end line and CWE

### code-review-audit.ts

- `writeCodeReviewNote({ auditSink, runId, payload })`, `writeCodeReviewFinding({ auditSink, runId, finding })`: write one `note` or `finding` event under the step `code-review`
- `CodeReviewAuditContext`, `WriteCodeReviewNoteOptions`, `WriteCodeReviewFindingOptions`: the options they take
- `codeReviewStep`: `code-review`

### fixtures

- `fixtures/changed-files.ts`: `sqlInjectionChangedFile`, `wideContextChangedFile`, `renamedChangedFile`, `binaryChangedFile`, `deletedChangedFile`, `lockfileChangedFile`, `generatedChangedFile`, `removedOnlyChangedFile`, `namedChangedFiles` as those eight in declaration order, `buildLargeChangedFile({ hunkCount, linesPerHunk })` with `BuildLargeChangedFileOptions`, `toAddedLines(hunkLines)` returning the added lines of hunk lines, and `testContextLines`, the 30 context lines every test renders at
- `fixtures/model-findings.ts`: `sqlInjectionModelFinding`, a `ModelFinding` grounded in the second added line of `sqlInjectionChangedFile`
- `fixtures/memory-audit-sink.ts`: `createMemoryAuditSink()` returning a `MemoryAuditSink` whose `events` array holds every written event
- `fixtures/fenced-content.ts`: `readFencedContent({ text, openTag, closeTag })` with `ReadFencedContentOptions`, the content between the tags of a fenced text, throwing when a tag is missing or the text is shorter than both tag lines
- `fixtures/markdown-fenced-blocks.ts`: `readFencedBlocks({ text, title })` with `ReadFencedBlocksOptions`, every fenced code block of a markdown text as a `FencedBlock` of `{ infoString, content }`, throwing when a block never closes, and `findFencedBlock({ fencedBlocks, infoString, title })` with `FindFencedBlockOptions`, the content of the first block with that info string
- `fixtures/review-harness.ts`: `runReview({ changedFiles, replies, isLlmEnabled, contextLines, maxChunkLines, clientModelId, reviewModelId })` with `RunReviewOptions`, returning a `ReviewRun` of `{ codeReviewResult, provider, auditSink }`; `buildOutputReply({ findings, injectionAttempts })` with `BuildOutputReplyOptions`, `emptyOutputReply`, `assemblePacket({ changedFiles, maxChunkLines })` with `AssemblePacketOptions`, `readAddedLineText(changedFile, index)`, `findCodeReviewEvents(auditSink)`, `findNotePayloads(auditSink, message)`, `findFindingEvents(auditSink)`, and the constants `reviewRunId`, `defaultClientModelId` and `defaultReviewModelId` the review tests share

## Inputs and outputs

`reviewCode` takes `ChangedFile` values from `src/shared/pull-request-source.ts`, an `LlmClient` from `src/shared/llm.ts` and an `AuditSink` from `src/shared/audit.ts`. `contextLines` is the caller's context setting, the `contextLines` of `ReviewOptions` in `src/shared/review.ts`, which `config/review.json` sets to 30. It must be the value the pull request source produced its hunks with, because the packet caps context and never adds it. The pipeline change that wires `reviewCode` to a source is not written yet. It reads `prompts/code-review/v<N>.md` through the prompts module, taking the highest version. It produces `CodeReviewFinding` values from `src/shared/finding.ts`, each parsed through `codeReviewFindingSchema`, with `isIntroducedByPullRequest` true, `promptVersion` from the loaded template and `model` from `modelId`.

It writes these audit events under the step `code-review`, every one a `note` unless stated:

- `{ message: 'code review skipped because the llm is disabled' }` when `isLlmEnabled` is false, and then nothing else
- `{ message: 'review packet assembled', packetHash, chunkCount, skippedFiles }` once per review
- `{ message: 'injection attempt', file, line }` once per attempt the model reports
- `{ message: 'finding rejected by grounding', reason, file, vulnerabilityType, title, startLine, endLine, chunkFile, chunkNumber }` once per drop
- `{ message: 'chunk skipped after output validation failure', file, chunkNumber, error }` once per chunk whose answer failed the schema twice
- a `finding` event with `{ finding }` once per returned finding

The llm client writes its own `llm-call` event per model call.

## Allowed imports

shared, llm, prompts

Bun and Node built-ins and npm packages are always allowed.

## Files

- `prompt-version.test.ts`: the given prompt version is loaded, and the highest version is loaded without one
- `review-code.ts`: `reviewCode`, the session, the disabled path, the packet note, the chunk loop, the totals, dedupe, finding shaping with `createFindingId` and the finding events
- `review-code.test.ts`: against the fake provider through the harness: the disabled run, one request per chunk in packet order with the user turn equal to the fence of each chunk text, a file split into three chunks sent in chunk order, the fence described in the system turn, a provider error rethrown, the finding shape with its provenance on a review model that differs from the client model and a 16 hex id that is stable across runs and differs by CWE, and the packet note and finding events
- `review-code-answers.test.ts`: the answers of the fake provider: injection attempts as notes with their count, a fabricated evidence line dropped with a note and the count, each other grounding rejection reason dropped with a note naming it, a grounded finding kept, a duplicate across two chunks collapsed to the higher confidence, two CWEs on one range both kept, and the schema failure path skipping one chunk and keeping the other
- `review-chunk.ts`: `reviewChunk`, the prompt build and model call with the validation failure caught, the injection notes, grounding and the grounding notes
- `review-packet.ts`: `assembleReviewPacket`, the input validation, the path sort, the skip split, the context cap, hunk rendering, chunk packing, chunk text and the hash
- `review-packet.test.ts`: the snapshot, the same packet twice, path order with the input untouched, every skip reason, the chunk header lines, the sql injection hunk rendered line by line, the context cap at 30 with head lines 11 through 71, the hunk header counted from the first shown line after a cap, a hunk with no change left whole, every hunk line matching the numbered line shape, removed lines showing 0, a removed-only hunk with the `+0,0` header, and the hash as 64 lowercase hex characters, the same across two runs, equal to the sha256 of the joined chunk texts and changing with one added line
- `review-packet-chunking.test.ts`: eight hunks of 100 lines split into two chunks on hunk boundaries, an oversized hunk alone, an empty hunk given no chunk of its own, and a custom limit
- `review-packet-validation.test.ts`: a negative or fractional context count, a chunk limit of 0 or fractional, an empty path, a path or previous path with a newline, a hunk line text with a newline, and a path named twice each throw an error naming the setting, the path or the head line
- `__snapshots__/review-packet.test.ts.snap`: the packet over the named fixtures at 30 context lines
- `skip-rules.ts`: `findSkipReason`, the lockfile names, the generated segments, suffixes and infix, and the added line check over both `addedLines` and the hunks
- `skip-rules.test.ts`: a modified source file with added lines kept, each reason, the check order, a file with added lines listed but no added hunk line, a file with no hunks, every lockfile name and generated pattern, a source file named like a lockfile kept, and a segment or name that only resembles a generated one kept
- `review-prompt.ts`: `buildReviewPrompt`, the variable check and `codeReviewPromptId`
- `review-prompt.test.ts`: the fence as the user turn, the chunk byte for byte inside it, the fence described in the system turn with the whole rendered allowlist, no placeholder left, a `{{name}}` in the chunk staying in the user turn, a template whose text lacks a placeholder rejected, and the shipped prompt loading as version 1 with the two variables and naming both output fields
- `prompt-examples.test.ts`: the three worked examples titled true positive, tricky negative and pre-existing issue, each present in the loaded rubric, parsed back into a changed file and re-rendered through the packet byte for byte, its answer passing the output schema, every finding in it grounded, one finding for the true positive and none for the two negatives. The parser accepts exactly the packet format: a removed line shows 0 and every other line a positive head line, a new hunk starts at each `@@` line and a `renamed from:` header needs the status renamed
- `model-output.ts`: the model answer schema with a description on every field
- `model-output.test.ts`: a round trip, an empty answer, the sample finding accepted, and rejections of empty evidence, an unknown severity, line 0 and confidence 1.5
- `vulnerability-type-allowlist.ts`: `allowedVulnerabilityTypes`, `isAllowedVulnerabilityType` and `renderVulnerabilityTypeAllowlist`
- `vulnerability-type-allowlist.test.ts`: unique well-formed ids, membership, the input-less weaknesses absent, and one rendered line per entry
- `grounding.ts`: `groundFinding` and its four checks
- `grounding.test.ts`: a grounded finding, a fabricated and a trimmed evidence line, a range on context lines only, a reversed range, a range touching one added line, a CWE outside the list and near-miss ids such as `cwe-89`, another file, and the order of the reasons
- `dedupe-findings.ts`: `dedupeFindings`, the position and confidence comparators and the pairwise beat check
- `dedupe-findings.test.ts`: the higher confidence kept whatever the input order, a tie keeping the earlier position, identical findings keeping the one reported first, a different CWE or file or a non-overlapping range kept, ranges sharing an end line overlapping, a broad finding beaten by a narrower one, a chain with a weak bridge, a chain of equal confidence keeping both ends, CWE ids in code unit order, the output order, an empty input and the input left as it was
- `code-review-audit.ts`: `writeCodeReviewNote`, `writeCodeReviewFinding` and the event stamp
- `code-review-audit.test.ts`: the memory sink keeping write order, `codeReviewStep` as `code-review`, both events parsing through `auditEventSchema` under the step with their kind and payload, and the note timestamp between the write start and now
- `fixtures/changed-files.ts`: the sample changed files, one per skip rule, one weakness, one wide context, one rename, their ordered list, the large file builder, the added lines helper and the test context lines
- `fixtures/changed-files.test.ts`: every fixture parses through `changedFileSchema`, lists exactly its added hunk lines as added lines, the ordered list names the eight fixtures in declaration order, and the large file builder numbers its lines with a gap of ten between hunks
- `fixtures/model-findings.ts`: the sample model finding
- `fixtures/memory-audit-sink.ts`: the in-memory audit sink the tests read
- `fixtures/fenced-content.ts`: the fence content reader the prompt and review tests share
- `fixtures/markdown-fenced-blocks.ts`: the fenced code block reader the prompt examples test uses
- `fixtures/review-harness.ts`: the review test harness
- `tsconfig.json`: the module's composite TypeScript project. It references shared, llm and prompts
- `AGENTS.md`: this file

## Invariants

### Packet format

- The packet rejects malformed input with an error instead of rendering it: a context count that is not a nonnegative integer, a chunk limit that is not an integer of at least 1, an empty path, a path or previous path holding a carriage return or newline, a hunk line text holding a newline, and a path named twice. The disabled path returns before the packet is built, so it validates nothing.
- Files are sorted by path in code unit order through `compareStrings` from shared, the order the pull request source uses. Binary files, deleted files, lockfiles by file name, generated files by path segment or file name, and files with no added lines are skipped in that order of checks, and each skipped path is recorded with its reason. A file has added lines only when `addedLines` is non-empty and some hunk line is added.
- Each hunk keeps at most `contextLines` context lines before its first added or removed line and after its last one. A hunk with no change is left whole. The packet never reads file content, so it cannot add context the source did not produce.
- A chunk's text is `file: <path>`, `status: <status>`, `renamed from: <previousPath>` only when `previousPath` is set, `chunk: <n> of <count>`, then per hunk the header `@@ +<head line of the first shown added or context line, or 0 when there is none>,<count of shown added and context lines> @@` and one line per hunk line as `<headLine> <marker> <text>`, with `+` for added, `-` for removed and a space for context. Lines are joined by `\n` with no trailing newline. A removed line shows the head line number the source stores, which is 0.
- A file whose rendered hunk lines exceed `maxChunkLines` is split into chunks of whole hunks filled in order. A hunk larger than the limit is a chunk on its own, and a hunk with no lines gets no chunk. Headers do not count toward the limit.
- `hash` is the lowercase hex sha256 of the chunk texts joined by `\n`. It keys the model input only, and the packet note carries the skipped files beside it. The same changed files and settings always give the same packet, the same hash and the same prompts, so the llm cache hits on a rerun.

### Prompt

- The prompt file renders into the system turn with `fence_description` from `describeFence` and `vulnerability_type_allowlist` from `renderVulnerabilityTypeAllowlist`. The user turn is the chunk text fenced with the label `diff` and nothing else, so instructions and data never share a turn. A template whose text does not use both placeholders is rejected before any call.
- The CWE allowlist lives in `vulnerability-type-allowlist.ts` only and holds only classes where the model can name an input or a caller, because the rubric demands a named input. Missing or incorrect authentication and authorization stay in, because the unauthenticated request is the input. The prompt sees what the grounding filter checks.
- The three worked examples in the prompt render through `assembleReviewPacket` byte for byte and their answers pass the output schema and the grounding filter. A test enforces it, so the examples cannot drift from the renderer and a renderer change fails that test. The prose of the packet format section is not checked and is updated by hand.
- Chunks are reviewed one after another, so canned replies in a test land in packet order.

### Grounding rules

- A finding is checked against the chunk's file, never the file the model names. The checks run in order and the first failure is the recorded reason: the finding's `file` must equal the chunk's file, its `vulnerabilityType` must be on the allowlist by exact string, every `evidence` line must equal the text of an added line of that file exactly with no trimming, and some added line number must satisfy `startLine <= line <= endLine`.
- Every drop writes a note with its reason, the chunk's file and chunk number, and is counted in `groundingRejectionCount`. A grounded finding is kept as the model gave it.
- Dedupe is pairwise: a finding is dropped when any finding with the same file and CWE overlaps its range, end lines included, with a higher confidence, kept or not, or when a kept finding overlaps it with an equal confidence, which means the kept one came earlier in file, start line, end line, CWE order. No two overlapping findings with the same file and CWE remain, a weak finding under a broad finding is dropped even when a narrower finding beats the broad one, and both ends of a chain of equal confidence are kept. The result is ordered by file and CWE as code unit strings and by start line and end line numerically. Two findings equal in every ordering field and in confidence keep the one reported first.
- The finding id is `createFindingId` over the detector and the file, start line, end line and CWE joined by newlines, so the same weakness at the same place has the same id across runs, prompts and models.

### Failure handling

- A chunk whose answer fails the schema on the attempt and the retry is noted and counted in `failedChunkCount`, and the review goes on with the next chunk. Any other error from the llm client propagates.
- With the llm disabled the prompt is still loaded, so the result reports the prompt version, and then nothing runs but the skip note.

## How to test

`bun test src/code-review` runs every test in the module, the fixture tests included. The review tests build an llm client on the fake provider with zero-priced models and the memory audit sink through `fixtures/review-harness.ts`, so no test needs a network, a key or the cache. `bun test src/prompts/prompt-files.test.ts` loads the shipped prompt. `bun check src/code-review` type-checks the module.

## Known gaps

- No verifier pass: a grounded finding is never re-asked. Few-shot examples drawn from benchmark failures are also left to the improvement change.
- Chunks run one at a time. A large pull request waits on each call in turn.
- The grounding filter accepts any evidence line of the file, not only lines inside the finding's range or inside the chunk the model saw.
- An injection attempt is recorded as the model reports it. Its file and line are not checked against the packet.
- The model is told that a chunk may be part of a larger file, but a chunk never carries lines from another chunk, so a weakness that spans two chunks can be missed.
- Weaknesses with no untrusted input, such as hard-coded credentials, weak algorithms, cleartext storage and weak randomness, are outside the allowlist. The secrets detector covers credentials.
- On the llm client's one validation retry, the correction it appends sits after the fence's close tag in the user turn.
