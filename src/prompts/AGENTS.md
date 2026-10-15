# prompts module

## Purpose

Loads versioned, hashed prompt templates from `prompts/<promptId>/v<N>.md` and renders them with their variables.

## Public API

- `loadPrompt({ id, version, promptsDirectory })`: returns the `PromptTemplate` for one prompt version, or for the highest version present when `version` is omitted. `promptsDirectory` defaults to the `prompts/` directory at the repository root
- `LoadPromptOptions`: the options `loadPrompt` takes
- `defaultPromptsDirectory`: the absolute path of `prompts/` at the repository root
- `renderPrompt(template, variables)`: returns the template text with every `{{name}}` placeholder replaced by its value. Throws when a declared variable has no value
- `findPlaceholderNames(text)`: returns the distinct placeholder names in a text, in order of first use

## Inputs and outputs

Reads prompt files from disk. Each file is YAML frontmatter with `id`, `version`, `description` and `variables`, then the template body. Produces the `PromptTemplate` contract from `src/shared/llm.ts`: `id`, `version` as a string such as `"2"`, `hash` as the lowercase hex sha256 of the whole file, `text` as the trimmed body, and `variables`. Callers pass `id`, `version` and `hash` to the llm client, which logs them on every call.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `prompt-loader.ts`: `loadPrompt`, version selection, frontmatter parsing with `Bun.YAML` and the checks against the file location and body
- `prompt-loader.test.ts`: explicit and highest version, missing prompt and missing version, an id that differs from its directory, an undeclared placeholder, and the hash equal to the sha256 of the file
- `prompt-renderer.ts`: `renderPrompt`, `findPlaceholderNames` and the placeholder pattern both files use
- `prompt-renderer.test.ts`: every variable filled, a missing variable named in the error, and braces inside a value kept as written
- `prompt-files.test.ts`: every `prompts/*/v*.md` file loads twice with the same hash, equal to the sha256 of its bytes
- `tsconfig.json`: the module's composite TypeScript project. It references shared only
- `AGENTS.md`: this file

## Invariants

- A prompt file lives at `prompts/<promptId>/v<N>.md` with N a positive integer, and its frontmatter `id` and `version` match the directory and the file name.
- The body placeholders and the declared `variables` are the same set. A file that disagrees fails to load.
- The hash covers every byte of the file, frontmatter included, so any edit gives a new hash. A changed prompt is a new version file, never an edit to a shipped one.
- `renderPrompt` replaces placeholders in one pass. A value that contains `{{name}}` is inserted as written and never expanded.

## How to test

`bun test src/prompts` runs the loader, renderer and shipped prompt tests. The loader tests read the fixtures under `test/fixtures/prompts/`. `bun check src/prompts` type-checks the module.

## Known gaps

- `prompts/` ships no prompts yet. The code review and summary prompts arrive with those modules.
- `renderPrompt` ignores values for names the template does not declare.
- There is no listing of every prompt id. Callers name the id they need.
