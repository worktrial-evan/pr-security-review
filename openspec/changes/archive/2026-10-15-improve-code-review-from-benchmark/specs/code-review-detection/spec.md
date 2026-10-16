## ADDED Requirements

### Requirement: Prompt versions after v1
A prompt change SHALL ship as a new file `prompts/code-review/v<N>.md` with the next unused version number, and `v1.md` SHALL stay byte for byte as it is. Each later version SHALL load as prompt `code-review` with the variables `fence_description` and `vulnerability_type_allowlist`. Each worked example in it SHALL render through the packet byte for byte, and its answer SHALL pass the output schema and the grounding filter.

#### Scenario: A later version loads
- **WHEN** a version after 1 is loaded and rendered
- **THEN** the text holds every allowed CWE id and the fence description, and no placeholder is left

#### Scenario: v1 is untouched
- **WHEN** `prompts/code-review/v1.md` is compared with its content before this change
- **THEN** the two are identical

### Requirement: Moved code is pre-existing
The prompt version that carries the moved-code rule SHALL state that a line a pull request adds is still pre-existing when the same chunk removes the same code at another place. Such code SHALL never be flagged unless the move itself sends new untrusted input into it. The version SHALL hold a worked example of such a move whose answer has no findings.

#### Scenario: Moved code example
- **WHEN** the rubric with the moved-code rule is read
- **THEN** it holds a worked example where one chunk removes vulnerable code and adds it back unchanged at another place, and the example's answer has an empty `findings` array

### Requirement: Input-less classes stay off the allowlist
The allowlist SHALL leave out weaknesses with no untrusted input, including hard-coded credentials as CWE-798. The secrets detector reports credentials. A prompt version MAY describe CWE-798, but a finding that names it SHALL be rejected while the allowlist leaves it out.

#### Scenario: Input-less classes rejected
- **WHEN** a finding names CWE-312, CWE-319, CWE-327, CWE-330, CWE-732 or CWE-798
- **THEN** the grounding filter rejects it as a type that is not allowed
