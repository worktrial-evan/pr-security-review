# Spec Delta

## Purpose

Gives every finding a short plain-language summary and a mitigation. Model text is only accepted when every version, id, package and url in it came from the data the model received.

## ADDED Requirements

### Requirement: Every finding is summarized
Summarizing SHALL fill `summary`, `remediation` and `summarySource` on every finding it receives and return the findings in their input order.

#### Scenario: Mixed findings
- **WHEN** a list of introduced and pre-existing findings is summarized
- **THEN** every returned finding has a non-empty summary, a non-empty remediation and a summary source of `model` or `template`, in the input order

### Requirement: Pre-existing findings skip the model
A finding whose `isIntroducedByPullRequest` is false SHALL get a templated one-line summary with summary source `template`, and SHALL never be sent to the model.

#### Scenario: Only pre-existing findings
- **WHEN** every finding is pre-existing
- **THEN** no model call is made and every finding has summary source `template`

### Requirement: Packet holds only the finding's own data
The text sent to the model for a finding SHALL hold only that finding's fields and, for a dependency finding, its advisory summary, details, fixed versions, reference urls and dependency path. Evidence lines and advisory text SHALL each be fenced as untrusted content, and the system prompt SHALL include the fence description for every fence.

#### Scenario: Dependency finding packet
- **WHEN** a dependency finding with an advisory is sent to the model
- **THEN** the user text contains the advisory summary and details inside a fence, the system prompt contains that fence's description, and no other repository content is present

#### Scenario: Code finding packet
- **WHEN** a code-review finding is sent to the model
- **THEN** its evidence lines appear inside a fence and the system prompt contains that fence's description

### Requirement: Grounding rules
A model summary SHALL be rejected when it contains a semver-looking version not in the packet, a CVE, GHSA or other advisory id not in the packet, a package name that is neither the finding's package nor on its dependency path, or a url not among the advisory references. A missing summary for a finding SHALL also be rejected.

#### Scenario: Invented version
- **WHEN** the output names a version the packet does not contain
- **THEN** it is rejected with a violation naming that version

#### Scenario: Invented id
- **WHEN** the output names a CVE or GHSA id the packet does not contain
- **THEN** it is rejected with a violation naming that id

#### Scenario: Unknown package
- **WHEN** the output names a scoped package or a `name@version` whose name is not the finding's package or on its dependency path
- **THEN** it is rejected with a violation naming that package

#### Scenario: Unknown url
- **WHEN** the output contains a url that is not one of the advisory references
- **THEN** it is rejected with a violation naming that url

#### Scenario: Grounded output
- **WHEN** every version, id, package and url in the output comes from the packet
- **THEN** it is accepted

### Requirement: Retry once, then fall back to a template
A rejected summary SHALL be requested once more with its violations appended. When the retry is also rejected, or a model call fails, the finding SHALL get a summary and remediation built from its packet, with summary source `template`.

#### Scenario: Retry succeeds
- **WHEN** the first output for a finding is rejected and the retry is grounded
- **THEN** the finding gets the retry's text with summary source `model`, and the retry request lists the violations

#### Scenario: Retry fails
- **WHEN** the first output and the retry are both rejected
- **THEN** the finding gets the template text with summary source `template`, and no third call is made for it

#### Scenario: Template is grounded
- **WHEN** a template summary is built for any finding
- **THEN** it passes the grounding rules for that finding's packet

### Requirement: Batched calls under a cap
Introduced findings SHALL be sent several per model call, with no call holding more findings than the cap, and the grounding rules SHALL be applied to each finding on its own.

#### Scenario: Calls bounded by the cap
- **WHEN** 7 introduced findings are summarized with a cap of 5 and every output is grounded
- **THEN** exactly 2 model calls are made and the reported cost is the sum of their costs

#### Scenario: One bad finding in a batch
- **WHEN** one finding in a batch has an ungrounded summary
- **THEN** only that finding is retried and the other findings keep their first summaries

### Requirement: Run record
Summarizing SHALL return the prompt id and version used, the number of rejected summaries, the number of model calls, the number of failed model calls and the summed cost in USD.

#### Scenario: Prompt version reported
- **WHEN** findings are summarized
- **THEN** the result names prompt `summarize` and the version of the prompt file used
