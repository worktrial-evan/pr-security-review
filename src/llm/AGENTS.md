# llm module

## Purpose

The LLM client behind the `LlmClient` contract: structured generate calls on a configured anthropic or fireworks model, with a deterministic response cache, cost accounting, retries and one audit event per call.

## Public API

- `createLlmClient({ modelId, prices, auditSink, runId, isCacheEnabled, cacheDirectory, provider, sleep })`: returns an `LlmClient`. `cacheDirectory` defaults to `resolveCacheDirectory()`, `provider` to the AI SDK provider and `sleep` to `Bun.sleep`
- `CreateLlmClientOptions`: the options `createLlmClient` takes
- `LlmOutputValidationError`: thrown when the output fails the caller's schema on the first attempt and on the retry. Has `promptId`, `modelId`, `validationMessage`, `rawOutput` and the summed `usage`
- `LlmHttpError`: a provider request that failed with an http status. Has `statusCode`
- `LlmProvider`, `LlmProviderRequest`, `LlmProviderResponse`: the boundary between the client and a model provider
- `createAiSdkLlmProvider()`: the provider that calls the Vercel AI SDK `generateObject`
- `resolveSamplingTemperature(modelId)`: 0 for a fireworks model and undefined for an anthropic model
- `resolveLanguageModel(modelId)`, `ResolvedLanguageModel`: the AI SDK model for an `anthropic/<model>` or `fireworks/<model>` id
- `createFakeLlmProvider(repliesByPromptId)`, `FakeLlmProvider`, `FakeLlmReply`, `FakeLlmRepliesByPromptId`: a provider with canned outputs and http errors keyed by prompt id, which records every request
- `readModelConfig(configPath)`: reads and validates `config/models.json`, comments allowed
- `modelConfigSchema`, `ModelConfig`, `modelPricesSchema`, `ModelPrices`, `modelPriceSchema`, `ModelPrice`, `modelIdSchema`, `defaultModelConfigPath`: the model config contract and its default path
- `modelProviders`, `ModelProvider`, `parseModelId(modelId)`, `ParsedModelId`: the known providers and the split of a model id at its first slash
- `computeCostUsd({ modelId, usage, prices })`, `ComputeCostUsdOptions`: the USD cost of a call, or null with a warning when the model has no price
- `createLlmCacheKey`, `resolveLlmCacheFilePath`, `readLlmCacheEntry`, `writeLlmCacheEntry`, `llmCacheEntrySchema`, `LlmCacheEntry`, `LlmCacheLocation`: the response cache
- `retryTransientHttpErrors({ operation, sleep })`, `isTransientHttpError(error)`, `llmRetryDelaysMs`: the 429 and 5xx retry
- `writeLlmCallEvent`, `toFailedLlmCallRecord`, `LlmCallRecord`, `LlmCallIdentity`: the llm-call audit event

## Inputs and outputs

`generate` takes `LlmGenerateOptions` from `src/shared/llm.ts`: the prompt id, version and hash the caller got from the prompts module, the system and user text, a zod schema and an optional model id that overrides the configured one. It returns `LlmGenerateResult`: the validated output, usage, `costUsd` or null, `isCacheHit` and `durationMs`.

It reads and writes `<cache directory>/llm/<key>.json`, calls the provider on a miss, and writes one `AuditEvent` of kind `llm-call` per call to the `AuditSink`. The event payload holds `status`, `modelId`, `promptId`, `promptVersion`, `promptHash`, `inputHash`, `usage`, `costUsd`, `isCacheHit`, `durationMs` and `rawOutput`, plus `error` on a failure. The AI SDK provider reads `ANTHROPIC_API_KEY` or `FIREWORKS_API_KEY` from the environment. `readModelConfig` reads `config/models.json`.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `llm-client.ts`: `createLlmClient` and the generate flow: cache lookup, provider call with retry, the validation retry, cost and cache write
- `llm-client.test.ts`: cache miss then hit at zero cost, a changed user text missing, caching disabled, the validation retry passing and failing, 429 retried, 503 exhausted after four attempts, 400 not retried, an unpriced model, an unknown provider prefix, and the audit event on success, cache hit, http failure and validation failure
- `llm-call-event.ts`: the llm-call audit event and the record of a failed call
- `llm-provider.ts`: the `LlmProvider` boundary and `LlmHttpError`
- `ai-sdk-llm-provider.ts`: the AI SDK provider, `generateObject` with no tools and no SDK retries, and `resolveSamplingTemperature`
- `ai-sdk-llm-provider.test.ts`: anthropic and fireworks model ids resolve, an unknown prefix throws
- `fake-llm-provider.ts`: the fake provider keyed by prompt id
- `llm-cache.ts`: the cache key, the entry schema, and reading and writing entries
- `llm-cache.test.ts`: the key changes with each of its five inputs, an entry round-trips, a missing or invalid entry is a miss
- `llm-retry.ts`: the transient http error retry with waits of 500, 1000 and 2000 milliseconds
- `llm-errors.ts`: `LlmOutputValidationError`
- `llm-cost.ts`: `computeCostUsd`
- `llm-cost.test.ts`: the per million price math and the unpriced warning
- `model-config.ts`: the `config/models.json` schema, `readModelConfig` and `parseModelId`
- `model-config.test.ts`: the checked-in config parses, every model id names a known provider, a fireworks id splits at the first slash
- `tsconfig.json`: the module's composite TypeScript project. It references shared only
- `AGENTS.md`: this file

## Invariants

- Every request never passes tools. A fireworks request runs at temperature 0. An anthropic request sends no temperature, because current Claude models reject a non-default value. Reruns are reproduced by the response cache, not by sampling.
- The cache key is the sha256 of the model id, prompt hash, system text, user text and the JSON schema form of the output schema. Changing any one of them misses the cache.
- Only output that passed the schema is cached, under the key of the original request, never the key of the validation retry.
- A cache hit never calls the provider and reports zero usage and `costUsd` 0.
- An unpriced model warns and returns `costUsd` null. It never fails the call.
- 429 and 5xx are retried at most three times. Any other http error is thrown after one attempt. A schema failure is retried once with the validation error appended to the user text.
- Every generate call writes exactly one llm-call audit event, including a call that throws and a cache hit.
- The client never imports the prompts module. Callers pass the prompt id, version and hash.

### Why benchmark reruns are reproducible

Temperature 0 makes the model pick its most likely token at every step, so the first run of a benchmark case is as close to deterministic as the provider allows. It is not fully deterministic, because providers do not guarantee identical output across calls. The cache closes that gap. A rerun with the same prompt file, inputs, output schema and model computes the same cache key and reads back the exact response the first run stored, at zero cost and with no network call. So a rerun scores the same outputs, and any change in the score comes from a change in the code, the prompt or the model. Editing a prompt changes its hash, and switching model changes the model id, so both miss the cache on purpose and are measured fresh.

## How to test

`bun test src/llm` runs every test in the module. Every client test runs against the fake provider with a temporary cache directory and an in-memory audit sink, so no test needs a network or an API key. `bun check src/llm` type-checks the module.

## Known gaps

- The AI SDK provider has no test that reaches a real model. Only its model id resolution is tested.
- `generateObject` is deprecated in AI SDK 7 in favor of `generateText` with an output setting. It lives only in `ai-sdk-llm-provider.ts`.
- The audit step is always `llm`. The client does not know which pipeline step called it.
- The retry ignores `retry-after` headers.
- The cache is never evicted. Delete `<cache directory>/llm` to force fresh calls.
