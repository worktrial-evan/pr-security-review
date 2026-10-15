# summarize module

## Purpose

LLM or template summaries and remediation text for findings. Model text is accepted only when every version, advisory id, package name and url in it came from the data the model received.

## Public API

- `summarizeFindings({ findings, advisoriesById, client, modelId, maxFindingsPerCall })`: returns a `SummarizeFindingsResult` with every finding's `summary`, `remediation` and `summarySource` filled, in input order. Findings with `isIntroducedByPullRequest` true go to the model in batches of at most `maxFindingsPerCall`, default 5. Pre-existing findings get a templated one-liner and never reach the model. It never throws on a model failure
- `SummarizeFindingsOptions`, `SummarizeFindingsResult`: the options, and the result with `findings`, `promptId`, `promptVersion`, `groundingRejectionCount`, `modelCallCount`, `failedModelCallCount` and `costUsd`
- `summarizePromptId`, `defaultMaxFindingsPerCall`: the prompt id `summarize` and the default batch cap
- `validateSummary({ modelSummary, grounding })`: returns one violation string per identifier in the summary and remediation that the grounding does not hold, or one violation for a missing or empty summary. It is pure
- `extractUrls`, `extractVersions`, `extractAdvisoryIds`, `extractPackageNames`: the extractors the validator and the packet share
- `SummaryGrounding`, `ModelSummary`, `ValidateSummaryOptions`: the allowed identifiers, the text for one finding and the validator options
- `buildSummaryPacket({ finding, advisoriesById })`, `renderSummaryPackets({ packets, violationsByFindingId })`, `describePacketFences(packets)`, `SummaryPacket`: the per-finding packet, the user text of one call and the fence descriptions for its system prompt
- `buildTemplateSummary(packet)`, `buildPreExistingSummary(packet)`, `pickFixedVersion(finding)`: the template text and the fixed version a template names

## Inputs and outputs

Takes findings from `src/shared/finding.ts`, advisories from `src/shared/advisory.ts` keyed by advisory id, and an `LlmClient` from `src/shared/llm.ts`. Reads `prompts/summarize/v1.md` through `loadPrompt`. The prompt file is the system prompt, and its one variable `fenceDescriptions` takes the `describeFence` sentence of every fence in the call. The user text lists the packets, each under `## Finding <id>`, with the violations of a rejected summary appended on the retry. The model returns `{ summaries: [{ findingId, summary, remediation }] }`.

The result's `promptId` and `promptVersion` are meant for `ReviewMetadata.promptVersions`, and `groundingRejectionCount` and `costUsd` for the metadata fields of the same name. A finding records only `summarySource`, since the finding contract has no prompt version field. A failed call writes its error to the audit log through the llm client and is counted in `failedModelCallCount`.

## Allowed imports

shared, llm, prompts

Bun and Node built-ins and npm packages are always allowed. Only the tests import llm, for the fake provider and the real client.

## Files

- `summarize-findings.ts`: `summarizeFindings`: the split, the batches, the model call, the per-finding validation, the retry and the template fallback
- `summarize-findings.test.ts`: on the fake provider, pre-existing findings make no call, input order is kept, a retry succeeds with the violations in its request, a second rejection falls back with no third call, one bad finding in a batch is retried alone, the fences and their descriptions, a failed call falls back, and 7 findings at a cap of 5 make 2 calls with their summed cost
- `summary-packet.ts`: the packet, which holds the finding's fields, the evidence and advisory fences and the grounding, plus the user text renderer and the fence descriptions
- `validate.ts`: `validateSummary` and the url, version, advisory id and package name extractors
- `validate.test.ts`: one test per rule for versions, CVE ids, GHSA ids, packages and urls, a grounded summary, a version inside an allowed url, a missing summary, an empty remediation, and a package on a code finding
- `summary-template.ts`: the template summary and remediation per detector, the pre-existing one-liner and `pickFixedVersion`
- `summary-template.test.ts`: every template passes `validateSummary` for its packet, the exact sca text, the pre-existing one-liner, and the fixed version picked
- `summary.samples.ts`: one sample finding per detector and the lodash advisory, for the tests in this module
- `tsconfig.json`: the module's composite TypeScript project. It references shared, llm and prompts
- `AGENTS.md`: this file

## Invariants

- Every finding passed in comes back with a summary, a remediation and a summary source, in input order.
- A pre-existing finding is never sent to the model.
- A packet holds only the finding's own fields and, for a dependency finding, the advisory summary, details, reference urls, fixed versions and dependency path. No repository code reaches the model beyond the evidence lines already on the finding.
- Evidence lines and advisory text are always fenced, and every fence in a call has its description in that call's system prompt, never inside the fence.
- A packet allows every semver-looking version and advisory id that appears anywhere in its text, plus the finding's version, fixed versions, advisory id and aliases. Its package names are the finding's package and the names on its dependency path, compared with `normalizePackageName`. Its urls are the advisory reference urls only.
- Each finding is validated on its own, retried at most once, and then falls back to its template. A batch costs at most two model calls.
- Every template passes the validator for its own packet.

## How to test

`bun test src/summarize` runs every test in the module on the fake provider, with no network and no key. `bun check src/summarize` type-checks the module.

## Known gaps

- The prompt version is reported once per run on the result, not on each finding. Recording it per finding needs a shared contract field.
- Bare unscoped package names and two-part versions such as `4.17` are not detected in model output.
- An injected advisory text can plant a version or advisory id that then counts as grounded. Urls are only allowed from the structured references.
- The validator does not check commands. The prompt forbids commands absent from the input.
- The `title` and `sourceToSink` of a code-review finding are model-written from untrusted code and go into the packet unfenced.
- Batches run one after another, never in parallel.
