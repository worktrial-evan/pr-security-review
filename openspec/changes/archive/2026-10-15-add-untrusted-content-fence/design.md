# Design

## Context

`src/prompts` holds the template loader and `renderPrompt`, which fills `{{name}}` placeholders in one pass and never expands braces inside a value. The module may import only `shared`, and the fence needs nothing from it. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- One small file with two exported functions and no new dependency.
- The same input gives the same fence, so the LLM response cache keys stay stable across benchmark reruns.

**Non-Goals:**
- Wiring the fence into code-review, summarize or the harness.
- Detecting or filtering injection text. The fence marks the boundary and nothing else.

## Decisions

- **Nonce from sha256, not random.** A random nonce changes the prompt on every run and breaks the response cache. A nonce derived from the label and content is unguessable before the content exists, and an attacker who writes the content cannot know the nonce that content will get, because the nonce depends on every byte they write. Alternative: random bytes. Rejected for the cache.
- **Rehash with a counter on collision.** If the nonce occurs in the content, hash again with the counter appended until it does not. The loop is deterministic, and the nonce check also guarantees the close tag cannot appear inside the content.
- **Hash input.** Counter 0 hashes `label`, a newline and the content. Counter N of 1 or more hashes `label`, a newline, the content, a newline and N. Alternative: always include the counter. Rejected so the first nonce matches the sha256 of the label and the content as the brief says.
- **Label check by pattern.** `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. A label is part of the tag name, so a strict pattern keeps tags well formed.
- **Content is passed through.** The code reviewer's grounding filter matches evidence lines verbatim against it, so nothing is escaped, trimmed or normalized. The nonce is the only protection.
- **`describeFence` goes in the system prompt.** The description would be attacker-forgeable if it sat inside the fence, so callers put it in the system prompt and the fence holds content only.
- **Types are local.** `UntrustedFence` is a plain type in `fence-untrusted.ts`. A shared contract would need a change to the frozen `src/shared`.

## Risks / Trade-offs

- [A model follows an instruction inside the fence anyway] → The fence lowers the risk and does not remove it. Callers keep their own output schema validation and the grounding filter.
- [A deterministic nonce is derivable by someone who knows the content and the algorithm] → The attacker writes the content before the nonce exists, so a close tag with the right nonce cannot be placed inside content that hashes to a different nonce. Content that contains its own nonce is rehashed.
- [Prompt text changes when the hash input rule changes] → A change to the rule changes every fenced prompt and invalidates cached responses. The rule is documented in AGENTS.md as fixed.
