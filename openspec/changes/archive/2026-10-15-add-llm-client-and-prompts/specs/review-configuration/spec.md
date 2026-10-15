# Spec Delta

## MODIFIED Requirements

### Requirement: Model configuration file
The repository SHALL include `config/models.json` with a default `reviewModelId`, a default `summarizeModelId`, and a `prices` map from model id to input and output USD per million tokens. Every model id SHALL name its provider as `anthropic/<model>` or `fireworks/<model>`. The shipped prices SHALL be zero, with a comment telling the user to fill them from the provider pricing page.

#### Scenario: File parses with comments
- **WHEN** `config/models.json` is read with a comment-tolerant JSON parser
- **THEN** it yields reviewModelId, summarizeModelId and a prices entry for each of those two ids with input and output set to 0

#### Scenario: Model ids name their provider
- **WHEN** `config/models.json` is read
- **THEN** reviewModelId, summarizeModelId and every prices key start with `anthropic/` or `fireworks/`
