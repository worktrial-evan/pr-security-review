# Spec Delta

## MODIFIED Requirements

### Requirement: Review contract
The review contract SHALL define ReviewOptions, ReviewMetadata, StepError, ReviewResult and the ReviewPipeline type with the fields and shape in the scenarios below.

#### Scenario: Data fields
- **WHEN** the review contract is used
- **THEN** ReviewOptions has isLlmEnabled, isCacheEnabled, isOffline, advisoryCacheDir, reviewModelId, summarizeModelId, contextLines and optional failOnSeverity; ReviewMetadata has runId, startedAt, finishedAt, optional pullRequestReference, baseSha, headSha, stepDurations, totalCostUsd, optional advisorySnapshot, promptVersions record, modelIds record, groundingRejectionCount, suspectedPromptInjectionCount and degradedSteps; StepError has step, message, isFatal; ReviewResult has metadata, findings, errors

#### Scenario: ReviewPipeline shape
- **WHEN** a pipeline is typed as a ReviewPipeline
- **THEN** it is a function of a pull request source, review options and an audit sink that returns a promise of a ReviewResult

#### Scenario: Review result round trip
- **WHEN** a review result with one finding of each detector kind and one step error is parsed
- **THEN** the parsed value deep-equals the sample
