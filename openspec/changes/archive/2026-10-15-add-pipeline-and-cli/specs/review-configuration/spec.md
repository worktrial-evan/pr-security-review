# Spec Delta

## MODIFIED Requirements

### Requirement: Model configuration file
The repository SHALL include `config/models.json` with a default `reviewModelId`, a default `summarizeModelId`, and a `prices` map from model id to input and output USD per million tokens. Every model id SHALL name its provider as `anthropic/<model>` or `fireworks/<model>`. The shipped prices SHALL be the published prices of the two default models, with a comment naming where and when they were taken.

#### Scenario: File parses with comments
- **WHEN** `config/models.json` is read with a comment-tolerant JSON parser
- **THEN** it yields reviewModelId, summarizeModelId and a prices entry for each of those two ids

#### Scenario: Model ids name their provider
- **WHEN** `config/models.json` is read
- **THEN** reviewModelId, summarizeModelId and every prices key start with `anthropic/` or `fireworks/`

### Requirement: Review configuration file
The repository SHALL include `config/review.json` with `contextLines` 30, `isLlmEnabled` true, `isCacheEnabled` true, `advisoryStaleHours` 24, `reviewPromptVersion` "1", `maxChangedFiles` 200, `maxFileBytes` 1000000 and `maxReviewCostUsd` 2.

#### Scenario: Defaults present
- **WHEN** `config/review.json` is read
- **THEN** it holds exactly those eight keys with those values
