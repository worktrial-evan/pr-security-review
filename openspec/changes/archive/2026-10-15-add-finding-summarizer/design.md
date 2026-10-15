# Design

## Context

`summarize` may import `shared`, `llm` and `prompts`. It calls the model through the `LlmClient` contract, loads its prompt with `loadPrompt` and fences untrusted text with `fenceUntrustedContent`. The llm client already retries a schema failure once, so the retry here covers only grounding. See proposal.md for the open details that were settled.

## Decisions

### Files

- `summary-packet.ts`: builds one packet per finding. It holds the fields, the fences and the grounding allowlists, which are versions, ids, package names and urls. It also renders a packet as user text
- `validate.ts`: `validateSummary({ text, packet })` returns the violations. It is pure and holds the extractors
- `summary-template.ts`: the template summary and remediation, and the pre-existing one-liner
- `summarize-findings.ts`: `summarizeFindings` splits the findings, batches the introduced ones, calls the model, validates, retries and falls back
- Tests: `validate.test.ts`, `summary-template.test.ts` and `summarize-findings.test.ts`, which uses the fake provider behind the real `createLlmClient`

The packet is its own file because the validator, the template and the caller all read it. The alternative of building the allowlists inside the validator would mean parsing rendered text back apart.

### Model output

The output schema is `{ summaries: [{ findingId, summary, remediation }] }`. The validator checks `summary` and `remediation` joined. Entries are matched back by `findingId`. An unknown id is ignored, and a missing id counts as a violation.

### Retry

After the first call of a batch, the findings that failed go into one retry call. Each finding's packet in that call is followed by its violations. A finding that fails again, or a call that throws, falls back to the template. So each finding costs at most two calls, and a batch costs at most two calls.

### Extraction order

Urls are extracted first and removed from the text, so a version or id inside an allowed url is not checked a second time. Then the validator checks semver-looking strings, with a leading `v` dropped, then ids, then package mentions. The id patterns are `CVE-YYYY-N`, `GHSA-xxxx-xxxx-xxxx` without regard to case, and the generic OSV form `PREFIX-YYYY-ID`, such as `PYSEC-2021-1`, `RUSTSEC-2020-0001`, `GO-2022-0001` and `MAL-2024-12`. The packet's version and id allowlists come from running the same extractors over all of its text, fences included, and adding its structured lists.

### Prompt

`prompts/summarize/v1.md` is the system prompt, with one variable `fenceDescriptions`. The user text is built in code: the packets in order, each under a heading that names its finding id.

## Risks / Trade-offs

- [An injected advisory text can plant a version or url, which then counts as grounded] → the fence and the prompt rules lower the risk. Urls are only allowed from the structured references, never from free text
- [Bare unscoped package names and two-part versions such as `4.17` are not detected] → recorded under Known gaps
- [`title` and `sourceToSink` on code-review findings are model-written from untrusted code and go into the packet unfenced] → recorded under Known gaps. The brief fences evidence and advisory text only
