# Proposal

## Why

Findings reach the report with a title and raw advisory data but no plain-language summary or mitigation. A model can write those, but model text that names a version, package, id or url it never saw would send a reader to the wrong fix, so every summary has to be checked against the data the model was given.

## What Changes

- New `summarizeFindings` in `src/summarize`: model summaries for findings the pull request introduces, a templated one-liner for pre-existing findings, batched calls under a cap
- New pure grounding validator in `src/summarize/validate.ts`, with one retry carrying the violations and a template fallback built from the packet
- New prompt `prompts/summarize/v1.md`
- `src/summarize/AGENTS.md` describes the module as built

Open details settled with the simplest option that meets the brief:

- The prompt version is returned once per run on the result, beside `promptId`, the grounding rejection count, the model call count and the summed cost, for `ReviewMetadata.promptVersions` and `groundingRejectionCount`. The `Finding` contract has no field for it and `src/shared` is frozen, so a finding records only `summarySource`. Agreed with the user
- `advisoriesById` is a `ReadonlyMap<string, Advisory>`. An sca finding whose advisory is missing gets a packet without advisory text
- The prompt file is the system prompt. Its one variable takes the `describeFence` sentences, and the user text lists the packets
- The packet's versions and ids are every semver-looking string and every advisory id that occurs anywhere in the packet, fenced text included. Its package names are the finding's package and the names on its dependency path. Its urls are the advisory references
- A package mention in model output is a scoped name such as `@scope/name` or the name in `name@1.2.3`. Bare unscoped names are not detected
- A client error, such as an http failure or a schema failure after the client's own retry, sends the findings in that call to the template and is counted on the result. It never throws
- The batch cap defaults to 5 findings per call and is an option
- Pre-existing findings get the one-liner as `summary` and the template mitigation as `remediation`
- The fixed version named by a template is the lowest fixed version above the installed one by `Bun.semver.order`, else the first listed

## Capabilities

### New Capabilities

- `finding-summaries`: grounded model or template summary and remediation text for every finding

### Modified Capabilities

none

## Impact

- New files under `src/summarize/` and `prompts/summarize/v1.md`
- `src/summarize/AGENTS.md` rewritten from its empty state
- No frozen file, shared contract, dependency or import matrix change. The module imports `shared`, `llm` for its tests' fake provider and client, and `prompts`, which its row already grants
