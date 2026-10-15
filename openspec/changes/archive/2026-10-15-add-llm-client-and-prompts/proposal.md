# Proposal

## Why

Code review, summaries and the harness all need to call a model, and the benchmark needs those calls to be repeatable and auditable. Today `src/llm` and `src/prompts` are empty, so there is no client behind the `LlmClient` contract and no way to load a prompt with a version and a hash.

## What Changes

- `src/prompts`: `loadPrompt` reads `prompts/<promptId>/v<N>.md`, validates its YAML frontmatter and returns a `PromptTemplate` with the sha256 of the file. `renderPrompt` fills `{{variable}}` placeholders and throws on a missing variable.
- `src/llm`: `createLlmClient` returns an `LlmClient` that calls the Vercel AI SDK `generateObject` at temperature 0 with no tools, caches raw responses on disk, prices each call from `config/models.json`, retries rate limits, server errors and schema failures, and writes one `llm-call` audit event per call.
- `src/llm`: a fake provider with canned outputs keyed by prompt id, so tests in this module and later ones need no network or key.
- `src/llm`: `readModelConfig` parses `config/models.json`.
- `config/models.json`: model ids gain the provider prefix, `anthropic/<model>`.

## Decisions

Open details in the brief, settled with the simplest option that meets the spec:

- `createLlmClient` also takes `runId`, because every audit event needs one. It takes an optional `provider` and `sleep` so tests inject the fake and skip the backoff wait.
- The brief's `cacheDir` is named `cacheDirectory`, following the no-abbreviation rule. It defaults to `resolveCacheDirectory()`.
- The prompt version is the integer `N` from `v<N>.md`. `PromptTemplate.version` holds it as a string, for example `"2"`.
- The prompt hash covers the whole file, frontmatter included. A prompt's body placeholders must match its declared `variables` exactly, or loading throws.
- A cache hit reports zero usage and `costUsd` 0. Only output that passed validation is cached, under the key of the original request.
- A call that needed the validation retry reports the summed usage and cost of both attempts.
- Backoff waits 500, 1000 and 2000 milliseconds before the three retries.
- `generateObject` is deprecated in AI SDK 7 in favor of `generateText` with an output setting. The brief names it, and it still ships, so it is used.

## Capabilities

### New Capabilities

- `prompt-templates`: versioned prompt files, how they are loaded, hashed and rendered.
- `llm-client`: the structured generate call, its cache, cost, retries, audit event and fake provider.

### Modified Capabilities

- `review-configuration`: model ids in `config/models.json` name their provider.

## Impact

- New code in `src/prompts` and `src/llm`, with their tests and `AGENTS.md`. Fixtures under `test/fixtures/prompts`.
- `config/models.json` changes its model id strings. No other file reads them yet.
- No new dependency and no shared contract change. Uses `ai`, `@ai-sdk/anthropic`, `@ai-sdk/fireworks`, `zod` and `jsonc-parser`, already installed, and `Bun.YAML` for frontmatter.
- LLM responses are cached under `<cache directory>/llm/`, outside the repository.
