# Spec Delta

## Purpose

Ships the checked-in defaults for which models a review uses, what they cost, and how a review behaves, so later changes read configuration from one place instead of hardcoding it.

## ADDED Requirements

### Requirement: Model configuration file
The repository SHALL include `config/models.json` with a default `reviewModelId`, a default `summarizeModelId`, and a `prices` map from model id to input and output USD per million tokens. The shipped prices SHALL be zero, with a comment telling the user to fill them from the provider pricing page.

#### Scenario: File parses with comments
- **WHEN** `config/models.json` is read with a comment-tolerant JSON parser
- **THEN** it yields reviewModelId, summarizeModelId and a prices entry for each of those two ids with input and output set to 0

### Requirement: Review configuration file
The repository SHALL include `config/review.json` with `contextLines` 30, `isLlmEnabled` true, `isCacheEnabled` true and `advisoryStaleHours` 24.

#### Scenario: Defaults present
- **WHEN** `config/review.json` is read
- **THEN** it holds exactly those four keys with those values
