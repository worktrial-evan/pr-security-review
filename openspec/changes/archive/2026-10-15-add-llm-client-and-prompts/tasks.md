# Tasks

## 1. Prompts module

- [x] 1.1 Write `src/prompts/prompt-renderer.ts` with the placeholder pattern and `renderPrompt`, and `prompt-renderer.test.ts` covering all variables filled, a missing variable throwing with its name, and a value containing `{{x}}` left as written; verify with `bun test src/prompts/prompt-renderer.test.ts`
- [x] 1.2 Write `src/prompts/prompt-loader.ts` with `loadPrompt({ id, version, promptsDirectory })`, fixtures under `test/fixtures/prompts/` (one prompt with `v1.md` and `v2.md`, one with a mismatched id, one with an undeclared placeholder), and `prompt-loader.test.ts` covering explicit version, highest by default, missing prompt, both mismatch errors and a hash equal to the sha256 of the file; verify with `bun test src/prompts/prompt-loader.test.ts`
- [x] 1.3 Write `src/prompts/prompt-files.test.ts` loading every `prompts/*/v*.md` twice and asserting each parses with a stable hash equal to the sha256 of its bytes; verify with `bun test src/prompts/prompt-files.test.ts`
- [x] 1.4 Fill `src/prompts/AGENTS.md` with the Public API, Files, Invariants and How to test; verify it lists every file in `src/prompts`

## 2. Model configuration and cost

- [x] 2.1 Prefix the model ids in `config/models.json` with `anthropic/`, write `src/llm/model-config.ts` with the config schema and `readModelConfig`, and `model-config.test.ts` asserting the checked-in file parses and every id names its provider; verify with `bun test src/llm/model-config.test.ts`
- [x] 2.2 Write `src/llm/llm-cost.ts` with `computeCostUsd` and `llm-cost.test.ts` covering 1000 input and 500 output tokens at 3 and 15 USD per million giving 0.0105, and an unpriced model giving null with one warning naming it; verify with `bun test src/llm/llm-cost.test.ts`

## 3. Provider boundary

- [x] 3.1 Write `src/llm/llm-provider.ts` with `LlmProvider`, its request and response types and `LlmHttpError`, and `src/llm/fake-llm-provider.ts` with canned outputs and errors keyed by prompt id and a record of every request; verify with `bun check src/llm/fake-llm-provider.ts`
- [x] 3.2 Write `src/llm/ai-sdk-llm-provider.ts` calling `generateObject` with temperature 0, `maxRetries` 0, no tools and an unvalidated JSON schema, converting `APICallError` to `LlmHttpError`, and `ai-sdk-llm-provider.test.ts` covering model id resolution for both prefixes and an unknown prefix throwing; verify with `bun test src/llm/ai-sdk-llm-provider.test.ts`

## 4. Client

- [x] 4.1 Write `src/llm/llm-cache.ts` with the cache key, read and atomic write, and `llm-cache.test.ts` covering a key that changes with each of its five inputs and an invalid entry read as a miss; verify with `bun test src/llm/llm-cache.test.ts`
- [x] 4.2 Write `src/llm/llm-retry.ts` with the 429 and 5xx retry and its waits; verify through the client tests in 4.4
- [x] 4.3 Write `src/llm/llm-errors.ts` with `LlmOutputValidationError`, `src/llm/llm-call-event.ts` with the audit event, and `src/llm/llm-client.ts` with `createLlmClient` and the generate flow: cache lookup, provider call with retry, validation retry, cost, cache write and one audit event per call; verify with `bun check src/llm/llm-client.ts`
- [x] 4.4 Write `src/llm/llm-client.test.ts` against the fake provider covering cache miss then hit with zero cost, caching disabled, the validation retry passing and failing, 429 retried, 503 exhausted after 4 attempts, 400 not retried, an unpriced model returning null cost, and the audit event shape on success and failure; verify with `bun test src/llm/llm-client.test.ts`
- [x] 4.5 Fill `src/llm/AGENTS.md` with the Public API, Inputs and outputs, Files, Invariants including why temperature 0 plus the cache makes benchmark reruns reproducible, How to test and Known gaps; verify it lists every file in `src/llm`

## 5. Final checks

- [x] 5.1 bun run verify passes
- [x] 5.2 module AGENTS.md updated: `src/llm/AGENTS.md` and `src/prompts/AGENTS.md` list every file in their module

## Workflow follow-up

- The user archives the change when they consider it finished.
