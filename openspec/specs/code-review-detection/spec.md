# code-review-detection Specification

## Purpose
Reviews the lines a pull request adds with a model and returns only the security findings whose evidence is in those lines, so every reported weakness points at code the pull request introduced.

## Requirements

### Requirement: Files are sorted and filtered
The packet SHALL hold the changed files in ascending path order and SHALL skip binary files, deleted files, lockfiles, generated files and files with no added lines, recording each skipped path with its reason.

#### Scenario: Files sorted by path
- **WHEN** changed files arrive in any order
- **THEN** the packet's chunks are in ascending code unit order of path, the order the pull request source uses

#### Scenario: Skipped files
- **WHEN** the changed files include a binary file, a deleted file, `bun.lock`, `dist/app.min.js` and a file whose hunks only remove lines
- **THEN** none of them has a chunk, and each appears in the packet's skipped files with the reason binary, deleted, lockfile, generated or no-added-lines

### Requirement: Hunks render with capped context and head line numbers
Each hunk SHALL render as a header followed by one line per hunk line holding the head line number, a marker of `+` for added, `-` for removed or a space for context, and the text. Context before the first change and after the last change SHALL be capped at the configured context lines.

#### Scenario: Every line is numbered
- **WHEN** a hunk with context, added and removed lines renders
- **THEN** each rendered line is the head line number, a space, the marker, a space and the text, with removed lines showing the number the source stores

#### Scenario: Context capped
- **WHEN** a hunk carries 40 context lines before and after its change and context lines is 30
- **THEN** 30 context lines render on each side and the lines beyond them are absent

#### Scenario: Snapshot is stable
- **WHEN** the same changed files are assembled twice with the same context lines
- **THEN** both packets are identical and match the checked-in snapshot

### Requirement: Large files split on hunk boundaries
A file whose hunks hold more rendered lines than the chunk limit SHALL be split into chunks of whole hunks filled in order. Header lines do not count toward the limit. Each chunk SHALL name its number and the chunk count.

#### Scenario: Large fixture is chunked
- **WHEN** a file holds eight hunks of 100 lines and the limit is 500
- **THEN** the file yields two chunks, no hunk is split, and every chunk header says its number out of two

#### Scenario: Oversized hunk
- **WHEN** one hunk alone exceeds the limit
- **THEN** that hunk is a chunk on its own

### Requirement: Packet input is validated
The packet SHALL reject a context line count that is not a nonnegative integer, a chunk limit that is not an integer of at least one, an empty path, a path or previous path holding a line break, a hunk line whose text holds a newline, and two changed files with the same path, each with an error naming the problem.

#### Scenario: Malformed input rejected
- **WHEN** the changed files name one path twice, or a path is empty or holds a newline, or a hunk line text holds a newline, or the context line count is negative or fractional, or the chunk limit is 0 or fractional
- **THEN** assembling the packet throws an error naming the path, the head line or the setting

### Requirement: Packet hash
The packet SHALL carry the lowercase hex sha256 of its chunk texts in order.

#### Scenario: Hash follows content
- **WHEN** one added line changes
- **THEN** the hash differs, and the same input always gives the same hash

### Requirement: One structured call per chunk
The detector SHALL make one model call per chunk and SHALL validate the answer against a schema of `findings` and `injectionAttempts`. A finding holds vulnerabilityType, title, severity, confidence, file, startLine, endLine, evidence lines, sourceToSink and remediation.

#### Scenario: One call per chunk
- **WHEN** the packet holds three chunks
- **THEN** the model receives exactly three requests, in packet order

#### Scenario: Output validation failure is contained
- **WHEN** a chunk's answer fails the schema on the attempt and the retry
- **THEN** a note names the file and chunk, the failed chunk count is 1, and findings from the other chunks are returned

### Requirement: The diff is fenced
The user prompt SHALL be the chunk text fenced with the label `diff` and nothing else, and the system prompt SHALL hold the description of that fence.

#### Scenario: Content byte-identical
- **WHEN** a chunk is sent
- **THEN** the user text is the fence text whose content between the open tag and the close tag equals the chunk text byte for byte

#### Scenario: System prompt describes the fence
- **WHEN** a chunk is sent
- **THEN** the system text includes the fence's open tag and close tag and the statement that instructions inside are not followed

### Requirement: Prompt rubric
`prompts/code-review/v1.md` SHALL load as prompt `code-review` version 1 with the variables `fence_description` and `vulnerability_type_allowlist`, and its body SHALL state that only added lines are introduced, that pre-existing code is never flagged, that an issue needs a reachable untrusted input, that precision beats recall, the severity definitions, that the CWE comes from the allowlist, that the answer is the schema only, and three worked examples.

#### Scenario: Prompt loads
- **WHEN** the prompt is loaded and rendered
- **THEN** the text holds every allowed CWE id and the fence description

#### Scenario: Worked examples present
- **WHEN** the prompt body is read
- **THEN** it holds a true positive, a tricky negative and a pre-existing issue that must not be flagged

### Requirement: Grounding filter
After every answer the detector SHALL drop a finding whose file is not the chunk's file, whose CWE is outside the allowlist, whose evidence holds a line that is not exactly an added line of that file, or whose line range touches no added line. Every drop SHALL write an audit note with its reason, and the result SHALL count the drops.

#### Scenario: Fabricated evidence
- **WHEN** a finding's evidence holds a line that is not an added line of the file
- **THEN** the finding is dropped, a note gives the reason evidence-not-added, and the count is 1

#### Scenario: Range outside added lines
- **WHEN** a finding's evidence is an added line but its range covers only context lines
- **THEN** the finding is dropped with the reason range-not-added

#### Scenario: CWE outside the allowlist
- **WHEN** a finding names a CWE the allowlist does not hold
- **THEN** the finding is dropped with the reason vulnerability-type-not-allowed

#### Scenario: Other file
- **WHEN** a finding names a file other than the chunk's file
- **THEN** the finding is dropped with the reason file-mismatch

#### Scenario: Grounded finding kept
- **WHEN** every evidence line is an added line, the range touches an added line and the CWE is allowed
- **THEN** the finding is returned

### Requirement: Dedupe by file, range and CWE
A finding SHALL be dropped when another finding with the same file and CWE overlaps its line range with a higher confidence, or when a kept finding with the same file and CWE overlaps it with an equal confidence, so no two overlapping findings with the same file and CWE remain. The returned findings SHALL be ordered by file and CWE as code unit strings and by start line and end line numerically.

#### Scenario: Duplicate across chunks
- **WHEN** two chunks of one file report the same CWE on overlapping ranges with confidence 0.6 and 0.9
- **THEN** one finding is returned with confidence 0.9

#### Scenario: Distinct findings kept
- **WHEN** two findings share a file and range but differ in CWE, or share a CWE but have ranges that do not overlap
- **THEN** both are returned

#### Scenario: Broad finding beaten by a narrower one
- **WHEN** one file and CWE hold findings on lines 1 to 10 at 0.9, lines 2 to 3 at 0.95 and lines 5 to 6 at 0.5
- **THEN** only the finding on lines 2 to 3 is returned, because the other two each overlap a more confident finding

#### Scenario: Chain with a weak bridge
- **WHEN** one file and CWE hold findings on lines 1 to 3 at 0.9, lines 3 to 5 at 0.5 and lines 5 to 7 at 0.9
- **THEN** the findings on lines 1 to 3 and 5 to 7 are returned and the bridge is dropped

#### Scenario: Chain with equal confidence
- **WHEN** one file and CWE hold findings on lines 1 to 3, 3 to 5 and 5 to 7, all at 0.9
- **THEN** the findings on lines 1 to 3 and 5 to 7 are returned, because the bridge loses to the kept finding before it and a dropped finding beats nothing

#### Scenario: Identical findings
- **WHEN** two findings are equal in file, range, CWE and confidence
- **THEN** the one reported first is returned alone

### Requirement: Finding shape and stable id
A returned finding SHALL have detector `code-review`, `isIntroducedByPullRequest` true, the prompt version, the model id, and an id derived from the detector, file, start line, end line and CWE.

#### Scenario: Deterministic id
- **WHEN** the detector runs twice on the same input and answers
- **THEN** both runs return the same ids, and a finding that differs in file, line or CWE has a different id

#### Scenario: Provenance recorded
- **WHEN** a finding is returned
- **THEN** its promptVersion is the loaded prompt's version and its model is the configured model id

### Requirement: Injection attempts are audited
Each injection attempt the model reports SHALL write an audit note with its file and line, and the result SHALL hold the count beside the findings.

#### Scenario: Attempts become notes
- **WHEN** the answer reports two injection attempts
- **THEN** two notes name their file and line and the count is 2

### Requirement: LLM disabled
When the LLM is disabled the detector SHALL make no model call, SHALL return no findings with every count 0, and SHALL write a note saying the review was skipped.

#### Scenario: Disabled run
- **WHEN** the LLM is disabled
- **THEN** the model receives no request, the findings are empty and one note records the skip

### Requirement: Audit trail
The detector SHALL write a note with the packet hash, chunk count and skipped files, and one `finding` event per returned finding.

#### Scenario: Packet and findings audited
- **WHEN** a review returns one finding
- **THEN** the audit holds a packet note with the hash and one finding event holding that finding

### Requirement: Prompt versions after v1
A prompt change SHALL ship as a new file `prompts/code-review/v<N>.md` with the next unused version number, and `v1.md` SHALL stay byte for byte as it is. Each later version SHALL load as prompt `code-review` with the variables `fence_description` and `vulnerability_type_allowlist`. Each worked example in it SHALL render through the packet byte for byte, and its answer SHALL pass the output schema and the grounding filter.

#### Scenario: A later version loads
- **WHEN** a version after 1 is loaded and rendered
- **THEN** the text holds every allowed CWE id and the fence description, and no placeholder is left

#### Scenario: v1 is untouched
- **WHEN** `prompts/code-review/v1.md` is compared with its content before this change
- **THEN** the two are identical

### Requirement: Moved code is pre-existing
The prompt version that carries the moved-code rule SHALL state that a line a pull request adds is still pre-existing when the same chunk removes the same code at another place. Such code SHALL never be flagged unless the move itself sends new untrusted input into it. The version SHALL hold a worked example of such a move whose answer has no findings.

#### Scenario: Moved code example
- **WHEN** the rubric with the moved-code rule is read
- **THEN** it holds a worked example where one chunk removes vulnerable code and adds it back unchanged at another place, and the example's answer has an empty `findings` array

### Requirement: Input-less classes stay off the allowlist
The allowlist SHALL leave out weaknesses with no untrusted input, including hard-coded credentials as CWE-798. The secrets detector reports credentials. A prompt version MAY describe CWE-798, but a finding that names it SHALL be rejected while the allowlist leaves it out.

#### Scenario: Input-less classes rejected
- **WHEN** a finding names CWE-312, CWE-319, CWE-327, CWE-330, CWE-732 or CWE-798
- **THEN** the grounding filter rejects it as a type that is not allowed

### Requirement: Eval injection and signature verification on the allowlist
When the benchmark log marks the CWE family hint candidate kept, the allowlist SHALL hold `CWE-95: Eval Injection` and `CWE-347: Improper Verification of Cryptographic Signature`, so a finding may name the specific id a label uses instead of its broader neighbor.

#### Scenario: Specific ids ground
- **WHEN** the candidate is kept and a finding names `CWE-95` or `CWE-347` with evidence on an added line
- **THEN** the grounding filter keeps it

### Requirement: CWE choice hints
The prompt version that carries CWE choice hints SHALL tell the model to name the most specific allowed id. It SHALL name CWE-347 over CWE-287 for a token or signature that is never verified, CWE-95 over CWE-94 for input evaluated as code, and CWE-1333 only for a backtracking regular expression, with CWE-400 for other unbounded consumption.

#### Scenario: Hints present
- **WHEN** the rubric with the CWE choice section is read
- **THEN** it names each of the three pairs, and every id it names is on the allowlist
