# Tasks

## 1. Packet and validator

- [x] 1.1 Add `src/summarize/summary-packet.ts`: per-finding packet with fields, evidence and advisory fences, and version, id, package and url allowlists, plus the user-text renderer. Verify with `bun check src/summarize/summary-packet.ts`
- [x] 1.2 Add `src/summarize/validate.ts` and `validate.test.ts`: one test per rule for versions, ids, packages and urls, one for a missing summary, one for a grounded summary, and one for a version inside an allowed url. Verify with `bun test src/summarize/validate.test.ts`

## 2. Template

- [x] 2.1 Add `src/summarize/summary-template.ts` and `summary-template.test.ts`: a template summary and remediation per detector, and the pre-existing one-liner. The test shows that every template passes `validateSummary` for its packet and that the fixed version picked is the lowest one above the installed version. Verify with `bun test src/summarize/summary-template.test.ts`

## 3. Prompt and summarizer

- [x] 3.1 Add `prompts/summarize/v1.md`: frontmatter with id `summarize`, version 1 and the variable `fenceDescriptions`, and rules that ask for at most two short paragraphs in plain language, the exact fixed version when one exists, the mitigation as an action, and no version, package, id, url or command absent from the input. Verify with `bun test src/prompts/prompt-files.test.ts`
- [x] 3.2 Add `src/summarize/summarize-findings.ts`: split the findings, batch under the cap, generate, validate per finding, retry once with violations, fall back to the template, and return the run record. Verify with `bun check src/summarize/summarize-findings.ts`
- [x] 3.3 Add `src/summarize/summarize-findings.test.ts` with the fake provider: pre-existing findings make no call, a retry succeeds, a retry fails and falls back with no third call, one bad finding in a batch, the packet fences with descriptions in the system prompt, a client failure falls back, and the cost assertion with 7 findings at cap 5 giving 2 calls and summed cost. Verify with `bun test src/summarize`

## 4. Finish

- [x] 4.1 bun run verify passes. Verify with `bun run verify`
- [x] 4.2 module AGENTS.md updated: `src/summarize/AGENTS.md` lists the public API, files, invariants, how to test and known gaps. Verify by reading it against the files in `src/summarize`
