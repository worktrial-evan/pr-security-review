# Spec Delta

## Purpose

Keeps every prompt as a versioned file in the repository, so a model call can name the exact prompt text it used by id, version and content hash.

## ADDED Requirements

### Requirement: Prompt file layout
Each prompt SHALL live at `prompts/<promptId>/v<N>.md`, where N is a positive integer. The file SHALL start with YAML frontmatter holding `id`, `version`, `description` and `variables`, followed by the template body with `{{variable}}` placeholders. The frontmatter id and version SHALL match the directory and file name, and the body placeholders SHALL match the declared variables exactly.

#### Scenario: Valid prompt file loads
- **WHEN** a prompt file has matching id, version and variables
- **THEN** loading it returns the id, the version as a string, the body as the text and the declared variables

#### Scenario: Mismatched file is rejected
- **WHEN** a prompt's frontmatter id differs from its directory name, or its body uses a placeholder it does not declare
- **THEN** loading it throws an error naming the file

### Requirement: Prompt version selection
Loading a prompt by id with a version SHALL return that version. Loading by id without a version SHALL return the highest version present for that id.

#### Scenario: Highest version by default
- **WHEN** a prompt has `v1.md` and `v2.md` and is loaded without a version
- **THEN** version 2 is returned

#### Scenario: Missing prompt
- **WHEN** a prompt id or version has no file
- **THEN** loading throws an error naming the id and version

### Requirement: Prompt content hash
A loaded prompt SHALL carry the lowercase hex sha256 of its whole file. The hash SHALL be the same on every load of an unchanged file.

#### Scenario: Stable hash
- **WHEN** the same prompt file is loaded twice
- **THEN** both loads return the same hash, equal to the sha256 of the file bytes

#### Scenario: Every shipped prompt parses
- **WHEN** every file under `prompts/` is loaded
- **THEN** each loads without error and its hash equals the sha256 of its bytes

### Requirement: Prompt rendering
Rendering a prompt with a map of variable values SHALL replace every placeholder with its value. Rendering SHALL throw when a declared variable has no value, and SHALL never return text with an unfilled placeholder from the template.

#### Scenario: All variables given
- **WHEN** a template with `{{diff}}` and `{{path}}` is rendered with both values
- **THEN** the text has both values in place and no placeholder from the template remains

#### Scenario: Variable missing
- **WHEN** a template is rendered without a value for one of its variables
- **THEN** rendering throws an error naming the missing variable
