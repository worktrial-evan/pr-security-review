# Design

## Context

The `LlmClient`, `LlmGenerateOptions`, `LlmGenerateResult`, `PromptTemplate` and `AuditSink` contracts are fixed in `src/shared`. The matrix lets `llm` and `prompts` import only `shared`, so the client never loads a prompt itself: callers pass the prompt id, version and hash they got from `prompts`. See proposal.md for scope and the settled details.

## Goals / Non-Goals

**Goals:** a provider boundary narrow enough that the fake and the AI SDK implementation are interchangeable, and a client whose retry, validation, cache and audit logic is fully tested through the fake.

**Non-Goals:** streaming, tools, a prompt registry, honoring `retry-after` headers, cache eviction.

## Decisions

### D1. A provider boundary inside `src/llm`

`LlmProvider` has one method: given a model id, prompt id, system text, user text and a JSON schema, it returns the raw parsed JSON and token usage, or throws `LlmHttpError` with a status code. The AI SDK provider and the fake both implement it. The fake sees the prompt id, so canned outputs are keyed by it, which a mock language model could not do. Alternative: the AI SDK's own mock model from `ai/test`. It only sees messages, so keying by prompt id would mean parsing prompts.

### D2. The client validates, not the SDK

The AI SDK provider passes `jsonSchema(z.toJSONSchema(schema))` without a validate function, so `generateObject` returns the model's JSON unvalidated. The client then runs `schema.safeParse` and owns the single validation retry with the error appended. Letting the SDK validate would hide the raw output inside `NoObjectGeneratedError` and split the retry logic across two places.

### D3. The client retries, not the SDK

`generateObject` runs with `maxRetries: 0`. The AI SDK provider converts `APICallError` to `LlmHttpError`, and the client retries status 429 and 5xx with waits of 500, 1000 and 2000 milliseconds through an injectable sleep. This keeps the retry count exact and testable with the fake.

### D4. Cache layout

The key is sha256 over `JSON.stringify` of the array `[modelId, promptHash, system, user, schemaJson]`, so field boundaries cannot collide. The file `llm/<key>.json` holds the model id, prompt id, raw output, the original usage and the creation time. It is written to a temporary name and renamed, so a crash never leaves a half-written entry. An unreadable or invalid entry counts as a miss.

### D5. Reproducible reruns

Temperature 0 makes a first run as close to deterministic as the provider allows. The cache makes every rerun exactly deterministic: the same prompt file, inputs, schema and model give the same key and so the same stored output. Editing a prompt changes its hash, which misses the cache on purpose.

### D6. Files

- `src/prompts`: `prompt-loader.ts` with `loadPrompt`, `prompt-renderer.ts` with `renderPrompt` and the placeholder pattern both files use.
- `src/llm`: `llm-client.ts` with `createLlmClient` and the generate flow, `llm-provider.ts` with the provider interface and `LlmHttpError`, `ai-sdk-llm-provider.ts`, `fake-llm-provider.ts`, `llm-cache.ts`, `llm-retry.ts`, `llm-cost.ts`, `model-config.ts`, `llm-errors.ts` for `LlmOutputValidationError`, and `llm-call-event.ts` for the audit event, which keeps the client under one screen per function and under 400 lines.

## Risks / Trade-offs

- [`generateObject` is deprecated in AI SDK 7] → it is isolated in `ai-sdk-llm-provider.ts`, so moving to `generateText` with an output setting touches one file.
- [Anthropic structured output uses a forced tool call inside the SDK] → this is SDK transport, not a tool the model can use. The client never passes `tools`.
- [The AI SDK provider has no network test] → model id parsing is tested, and every behavior above the provider runs against the fake.
- [A stale cache entry hides a provider change] → model id and prompt hash are in the key. Clearing `<cache directory>/llm` forces fresh calls.
