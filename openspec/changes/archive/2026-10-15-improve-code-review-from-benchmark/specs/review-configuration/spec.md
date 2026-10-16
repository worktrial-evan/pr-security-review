## MODIFIED Requirements

### Requirement: Review configuration file
The repository SHALL include `config/review.json` with `contextLines` 30, `isLlmEnabled` true, `isCacheEnabled` true, `advisoryStaleHours` 24, `reviewPromptVersion` set to the code-review prompt version that `docs/benchmark-log.md` records as kept, `maxChangedFiles` 200, `maxFileBytes` 1000000 and `maxReviewCostUsd` 2.

#### Scenario: Defaults present
- **WHEN** `config/review.json` is read
- **THEN** it holds exactly those eight keys with those values

#### Scenario: Live prompt version follows the log
- **WHEN** `config/review.json` and `docs/benchmark-log.md` are read
- **THEN** `reviewPromptVersion` names the version the log's results summary calls the final one
