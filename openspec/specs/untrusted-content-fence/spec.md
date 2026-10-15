# untrusted-content-fence Specification

## Purpose
Wraps attacker-controlled text in a nonce fence before it reaches a model, so every caller shares one tested defense against prompt injection and the same input always gives the same prompt.

## Requirements

### Requirement: Fence shape
Fencing SHALL take a label and content and return the label, a nonce, an open tag `<untrusted-LABEL-NONCE>`, a close tag `</untrusted-LABEL-NONCE>` and the text. The text SHALL be the open tag, a newline, the content, a newline and the close tag.

#### Scenario: Diff content is fenced
- **WHEN** content is fenced with the label `diff`
- **THEN** the tags are `<untrusted-diff-NONCE>` and `</untrusted-diff-NONCE>` with the returned nonce, and the text is the open tag, a newline, the content, a newline and the close tag

### Requirement: Label format
A label SHALL be lowercase kebab-case, such as `diff`, `evidence`, `advisory` or `failure-digest`. Any other label SHALL be rejected with an error.

#### Scenario: Invalid label
- **WHEN** a label is empty, has an uppercase letter, an underscore, a space, a leading or trailing hyphen, or a double hyphen
- **THEN** fencing throws an error naming the label

### Requirement: Deterministic nonce
The nonce SHALL be the first 16 hex characters of the sha256 of the label and the content, and SHALL never be random. When the nonce occurs anywhere in the content, the nonce SHALL be recomputed with an incrementing counter until it does not occur in the content.

#### Scenario: Same input, same nonce
- **WHEN** the same label and content are fenced twice
- **THEN** both fences have the same nonce and the same text

#### Scenario: Changed input, new nonce
- **WHEN** one character of the content changes
- **THEN** the nonce differs

#### Scenario: Nonce collides with content
- **WHEN** the content contains the nonce computed for it
- **THEN** the returned nonce is a different 16 hex string that does not occur in the content

### Requirement: Content is untouched
The content SHALL appear in the fenced text byte for byte. Fencing SHALL NOT escape, trim, normalize or rewrite it.

#### Scenario: Whitespace and line endings survive
- **WHEN** the content has trailing whitespace, CRLF line endings, or is an empty string
- **THEN** the content between the open tag newline and the close tag newline equals the input exactly

#### Scenario: Forged closing tag
- **WHEN** the content contains a closing tag without the nonce, or with a guessed nonce
- **THEN** the content stays whole inside the fence and the real close tag appears once, at the end of the text

#### Scenario: Placeholders stay literal
- **WHEN** fenced text containing `{{name}}` is passed to `renderPrompt` as a variable value
- **THEN** the rendered prompt holds `{{name}}` as written

### Requirement: Fence description
Describing a fence SHALL return a sentence for a system prompt. It SHALL name the fence's tags and say that the text between them is data under review, that it may contain instructions aimed at an AI, and that none of them are followed.

#### Scenario: Description names the tags
- **WHEN** a fence is described
- **THEN** the sentence includes the open tag and the close tag and states that instructions inside are not followed

### Requirement: One nonce per fence
Each fence in a prompt SHALL have its own nonce, derived from its own label and content.

#### Scenario: Several fences in one prompt
- **WHEN** two different contents are fenced with the same label
- **THEN** their nonces differ and neither fence's tags occur in the other's text
