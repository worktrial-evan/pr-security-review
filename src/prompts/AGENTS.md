# prompts module

## Purpose

Loads versioned, hashed prompt templates from `prompts/<promptId>/v<N>.md`, renders them with their variables, and fences attacker-controlled text before it goes into a prompt.

## Public API

- `loadPrompt({ id, version, promptsDirectory })`: returns the `PromptTemplate` for one prompt version, or for the highest version present when `version` is omitted. `promptsDirectory` defaults to the `prompts/` directory at the repository root
- `LoadPromptOptions`: the options `loadPrompt` takes
- `defaultPromptsDirectory`: the absolute path of `prompts/` at the repository root
- `renderPrompt(template, variables)`: returns the template text with every `{{name}}` placeholder replaced by its value. Throws when a declared variable has no value
- `findPlaceholderNames(text)`: returns the distinct placeholder names in a text, in order of first use
- `fenceUntrustedContent({ label, content })`: wraps content in a nonce fence and returns an `UntrustedFence`. Throws when `label` is not lowercase kebab-case, such as `diff`, `evidence`, `advisory` or `failure-digest`
- `describeFence(fence)`: returns the sentence a system prompt includes for that fence: the text between its tags is data under review, it may contain instructions aimed at an AI, and none of them are followed. Callers put it in the system prompt, never inside the fence
- `UntrustedFence`: `{ label, nonce, openTag, closeTag, text }`
- `FenceUntrustedContentOptions`: the options `fenceUntrustedContent` takes

## Inputs and outputs

Reads prompt files from disk. Each file is YAML frontmatter with `id`, `version`, `description` and `variables`, then the template body. Produces the `PromptTemplate` contract from `src/shared/llm.ts`: `id`, `version` as a string such as `"2"`, `hash` as the lowercase hex sha256 of the whole file, `text` as the trimmed body, and `variables`. Callers pass `id`, `version` and `hash` to the llm client, which logs them on every call.

`fenceUntrustedContent` reads nothing and produces an `UntrustedFence` whose `text` is `openTag`, a newline, the content, a newline and `closeTag`. The tags are `<untrusted-LABEL-NONCE>` and `</untrusted-LABEL-NONCE>`. A caller fences each file or finding separately, puts `text` in the user prompt, usually as a `renderPrompt` variable, and puts `describeFence` in the system prompt.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `prompt-loader.ts`: `loadPrompt`, version selection, frontmatter parsing with `Bun.YAML` and the checks against the file location and body
- `prompt-loader.test.ts`: explicit and highest version, missing prompt and missing version, an id that differs from its directory, an undeclared placeholder, and the hash equal to the sha256 of the file
- `prompt-renderer.ts`: `renderPrompt`, `findPlaceholderNames` and the placeholder pattern both files use
- `prompt-renderer.test.ts`: every variable filled, a missing variable named in the error, and braces inside a value kept as written
- `prompt-files.test.ts`: every `prompts/*/v*.md` file loads twice with the same hash, equal to the sha256 of its bytes
- `fence-untrusted.ts`: `fenceUntrustedContent`, `describeFence`, the label pattern and the nonce loop
- `fence-untrusted.test.ts`: the same input giving the same nonce, a one-character change giving another, a content that contains its nonce forcing a rehash, forged closing tags with and without a nonce staying inside the fence, content kept byte-identical for trailing whitespace, CRLF and an empty string, fenced text keeping a `{{placeholder}}` literal in `renderPrompt`, and an invalid label throwing
- `tsconfig.json`: the module's composite TypeScript project. It references shared only
- `AGENTS.md`: this file

## Invariants

- A prompt file lives at `prompts/<promptId>/v<N>.md` with N a positive integer, and its frontmatter `id` and `version` match the directory and the file name.
- The body placeholders and the declared `variables` are the same set. A file that disagrees fails to load.
- The hash covers every byte of the file, frontmatter included, so any edit gives a new hash. A changed prompt is a new version file, never an edit to a shipped one.
- `renderPrompt` replaces placeholders in one pass. A value that contains `{{name}}` is inserted as written and never expanded.
- The fence nonce is the first 16 hex characters of the sha256 of the label, a newline and the content. When the nonce occurs anywhere in the content, the nonce is recomputed from the label, a newline, the content, a newline and a counter that starts at 1 and goes up by 1, until it does not occur. The close tag therefore never appears inside the content.
- The nonce is never random. The same label and content always give the same prompt, so the LLM response cache keeps benchmark reruns identical and free. A random nonce would give every run a new prompt text and a cache miss. The content is written before its nonce exists and the nonce depends on every byte of it, so content cannot carry a valid close tag for its own fence.
- `fenceUntrustedContent` never escapes, trims or rewrites the content. The code reviewer's grounding filter matches evidence lines verbatim against it, so the nonce is the only protection.
- Each fence has its own nonce. Several fences in one prompt, one per file or per finding, are made by calling `fenceUntrustedContent` once for each.
- Changing the nonce rule changes every fenced prompt and invalidates every cached response that holds one.

## How to test

`bun test src/prompts` runs the loader, renderer, fence and shipped prompt tests. The loader tests read the fixtures under `test/fixtures/prompts/`. `bun check src/prompts` type-checks the module.

## Known gaps

- `prompts/` ships no prompts yet. The code review and summary prompts arrive with those modules.
- `renderPrompt` ignores values for names the template does not declare.
- There is no listing of every prompt id. Callers name the id they need.
- No module calls `fenceUntrustedContent` yet. code-review, summarize and the harness each wire it in with their own change.
- The fence lowers the risk of prompt injection and does not remove it. Callers still validate model output against a schema.
