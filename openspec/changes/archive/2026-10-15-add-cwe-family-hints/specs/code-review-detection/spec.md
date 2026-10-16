## ADDED Requirements

### Requirement: Eval injection and signature verification on the allowlist
When the benchmark log marks the CWE family hint candidate kept, the allowlist SHALL hold `CWE-95: Eval Injection` and `CWE-347: Improper Verification of Cryptographic Signature`, so a finding may name the specific id a label uses instead of its broader neighbor.

#### Scenario: Specific ids ground
- **WHEN** the candidate is kept and a finding names `CWE-95` or `CWE-347` with evidence on an added line
- **THEN** the grounding filter keeps it

### Requirement: CWE choice hints
The prompt version that carries CWE choice hints SHALL tell the model to name the most specific allowed id. It SHALL name CWE-347 over CWE-287 for a token or signature that is never verified, CWE-95 over CWE-94 for input evaluated as code, and CWE-1333 only for a backtracking regular expression, with CWE-400 for other unbounded consumption.

#### Scenario: Hints present
- **WHEN** the rubric with the CWE choice section is read
- **THEN** it names each of the three pairs, and every id it names is on the allowlist
