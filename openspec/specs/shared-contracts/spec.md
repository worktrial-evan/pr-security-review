# shared-contracts Specification

## Purpose
Defines the data contracts every module builds against, so detectors, the pipeline, the benchmark and the report agree on the shape of a finding, a pull request, a dependency, an advisory, an audit event, a run, a review and a benchmark case without importing each other.

## Requirements

### Requirement: One contract file per concept
The shared module SHALL hold one contract file per concept: finding, pull-request-source, dependency, advisory, audit, run-state, review, llm, benchmark. Each data contract SHALL be a runtime schema with its inferred static type exported beside it, so a value can be validated at a boundary and typed in code from one definition.

#### Scenario: Schema and type agree
- **WHEN** a value passes a contract's schema
- **THEN** it is assignable to that contract's exported type without a cast

#### Scenario: Invalid value is rejected
- **WHEN** a value missing a required field, or with a field of the wrong type, is parsed by a contract's schema
- **THEN** parsing fails with an error naming the offending field

### Requirement: Every schema round-trips a sample
Every exported schema SHALL accept a representative sample value and return an equal value from parsing it, with no fields dropped, added or coerced.

#### Scenario: Round trip
- **WHEN** a sample value for a schema is parsed by that schema
- **THEN** the parsed value deep-equals the sample

### Requirement: Variants are discriminated unions
Where a contract has variants, the shared module SHALL model each variant as its own union member discriminated by a kind field, and SHALL NOT use optional fields to merge variants.

#### Scenario: Finding variants
- **WHEN** a finding is parsed
- **THEN** its `detector` field selects exactly one of the SCA, code-review or secret variants, and the variant's own fields are required on that member only

### Requirement: Ids are branded
Ids such as the finding id SHALL be branded string types applied by the schema at the validation boundary, so two ids of different kinds are not interchangeable in code.

#### Scenario: Branded id flows from parsing
- **WHEN** a finding is parsed
- **THEN** its `id` has the finding id brand and a plain string is not assignable where that id is expected

### Requirement: Finding id derivation
A finding id SHALL be the first 16 hexadecimal characters of the SHA-256 digest over the detector kind and the finding's stable key. The derivation SHALL be deterministic and SHALL be exported for detectors to use.

#### Scenario: Same input, same id
- **WHEN** the derivation runs twice with the same detector and stable key
- **THEN** both calls return the same 16-character lowercase hex id

#### Scenario: Different detector, different id
- **WHEN** the derivation runs with the same stable key under two detectors
- **THEN** the two ids differ

### Requirement: Finding contract
The finding contract SHALL define Severity (critical, high, medium, low, info), DetectorKind (sca, code-review, secrets) and a FindingBase with: id, detector, severity, confidence in 0..1, title, optional file, startLine, endLine, isIntroducedByPullRequest, optional summary, remediation and summarySource (model or template). Each detector variant SHALL add the fields in the scenarios below.

#### Scenario: SCA finding fields
- **WHEN** an SCA finding is parsed
- **THEN** it requires packageName, version, advisoryId, aliases, isGithubReviewed, dependencyScope (prod or dev), reachability (direct-imported, direct-unused or transitive), importedBy, dependencyPath, fixedVersions, isVersionUnparseable and matcherAgreement (both, handwritten-only, oracle-only or oracle-unavailable), and accepts an optional cvssScore

#### Scenario: Code-review finding fields
- **WHEN** a code-review finding is parsed
- **THEN** it requires cwe, evidence, sourceToSink, promptVersion and model

#### Scenario: Secret finding fields
- **WHEN** a secret finding is parsed
- **THEN** it requires ruleId and fingerprint

#### Scenario: Confidence out of range
- **WHEN** a finding with confidence 1.5 is parsed
- **THEN** parsing fails

### Requirement: Pull request source contract
The pull-request-source contract SHALL define PullRequestReference, Hunk, ChangedFile and the PullRequestSource interface with the fields and members in the scenarios below.

#### Scenario: Data fields
- **WHEN** the pull-request-source contract is used
- **THEN** PullRequestReference has owner, repo, number, url; Hunk has oldStart, oldLines, newStart, newLines and lines each with a kind of added, removed or context and a head line number; ChangedFile has path, status of added, modified, deleted or renamed, optional previousPath, hunks, addedLines of line number and text, and isBinary

#### Scenario: PullRequestSource members
- **WHEN** a PullRequestSource implementation is typed against the interface
- **THEN** it provides describe returning baseSha, headSha and optional pullRequestReference, listChangedFiles, readFileAtBase, readFileAtHead, checkoutHead returning a directory path, and dispose

#### Scenario: Renamed file includes previous path
- **WHEN** a changed file with status renamed is parsed
- **THEN** it accepts previousPath and the parsed value keeps it

#### Scenario: Hunk line kinds
- **WHEN** a hunk line with a kind other than added, removed or context is parsed
- **THEN** parsing fails

### Requirement: Dependency contract
The dependency contract SHALL define DependencyVersion, DependencySet, DependencyDiff and the DependencyGraph interface with the fields and members in the scenarios below.

#### Scenario: Data fields
- **WHEN** the dependency contract is used
- **THEN** DependencyVersion has name, version, scope of prod or dev, isDirect, isWorkspace, isVersionUnparseable, optional realPackageName for npm aliases, and dependencyKeys as name@version; DependencySet has lockfileKind of bun or npm, lockfilePath, versionsByDependency mapping a name to its versions, and directDependencyNames; DependencyDiff has added, removed, changed with name, fromVersion and toVersion, and an unchanged count

#### Scenario: DependencyGraph members
- **WHEN** a DependencyGraph implementation is typed against the interface
- **THEN** it provides shortestPathTo returning name@version entries starting from a direct dependency

#### Scenario: Dependency set round trip
- **WHEN** a dependency set with two versions of one package is parsed
- **THEN** both versions stay under that package name and the direct dependency names are preserved

### Requirement: Advisory contract
The advisory contract SHALL define an OSV subset: Advisory, AffectedPackage, AdvisorySnapshot and the AdvisoryStore interface with the fields and members in the scenarios below.

#### Scenario: Data fields
- **WHEN** the advisory contract is used
- **THEN** Advisory has id, aliases, summary, details, optional severityScore and severityVector, affected, references of type and url, published, modified, optional withdrawn, and isGithubReviewed; AffectedPackage has ecosystem, name, ranges of type SEMVER, ECOSYSTEM or GIT with events of optional introduced, fixed and lastAffected, and versions; AdvisorySnapshot has fetchedAt, sourceUrl, entryCount, sha256

#### Scenario: AdvisoryStore members
- **WHEN** an AdvisoryStore implementation is typed against the interface
- **THEN** it provides getByPackage and snapshot

#### Scenario: Range type is restricted
- **WHEN** an affected range with a type other than SEMVER, ECOSYSTEM or GIT is parsed
- **THEN** parsing fails

### Requirement: Audit contract
The audit contract SHALL define AuditEvent (timestamp, runId, step, kind of step-start, step-end, step-error, llm-call, finding or note, a payload record, optional durationMs and costUsd) and the AuditSink interface with write.

#### Scenario: Audit event kinds
- **WHEN** an audit event with kind `llm-call` and a costUsd is parsed
- **THEN** parsing succeeds and both fields are kept

### Requirement: Run-state contract
The run-state contract SHALL define the ordered RunStage list (resolving-pull-request, collecting-files, parsing-lockfiles, matching, reachability, secrets, code-review, summarizing, rendering, done, failed) and RunState as a union discriminated by stage, each member including runId, startedAt and the completed stages with their durations, with the failed member also including the error.

#### Scenario: Failed state includes error
- **WHEN** a run state with stage failed is parsed
- **THEN** it requires an error and a state at any other stage rejects one

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

### Requirement: LLM contract
The llm contract SHALL define PromptTemplate (id, version, hash, text, variables), LlmGenerateOptions (promptId, promptVersion, promptHash, system, user, schema, optional modelId), LlmGenerateResult (output, usage with input and output tokens, costUsd or null, isCacheHit, durationMs) and the LlmClient interface with generate.

#### Scenario: Unknown cost is null
- **WHEN** a generate result with costUsd null is parsed
- **THEN** parsing succeeds and costUsd stays null rather than becoming zero

### Requirement: Benchmark contract
The benchmark contract SHALL define BenchmarkCase, ExpectedFinding and BenchmarkScore with the fields in the scenarios below.

#### Scenario: Data fields
- **WHEN** the benchmark contract is used
- **THEN** BenchmarkCase has id, split of dev or test, category of sca, code, secrets, clean or real-world, isClean, description, a source that is either kind snapshot with dir or kind git with repoUrl, baseSha and headSha, and expected findings; ExpectedFinding has detector and optional packageName, advisoryId, cwe, file, startLine, endLine, severity; BenchmarkScore has precision, recall, f1, byDetector, byCategory, falsePositivesOnClean, totalCostUsd, totalDurationMs and caseResults each with true positives, false positives and false negatives

#### Scenario: Snapshot and git sources
- **WHEN** a case with a snapshot source and a case with a git source are parsed
- **THEN** each parses to its own source variant and a source mixing both shapes fails

### Requirement: Cache directory resolution
The shared module SHALL export `resolveCacheDirectory()`, which returns the one directory that holds every cache: advisories, LLM responses and cloned benchmark repositories. That directory SHALL live outside the repository: the value of `PULL_REQUEST_REVIEW_CACHE_DIR` when it is set and non-empty, else `.cache/pull-request-review` under the home directory. The function SHALL create nothing on disk.

#### Scenario: Environment variable set
- **WHEN** `PULL_REQUEST_REVIEW_CACHE_DIR` is set to a path
- **THEN** `resolveCacheDirectory()` returns exactly that path

#### Scenario: Environment variable unset
- **WHEN** `PULL_REQUEST_REVIEW_CACHE_DIR` is not set
- **THEN** `resolveCacheDirectory()` returns a path under the home directory that ends in `.cache/pull-request-review`

#### Scenario: Environment variable empty
- **WHEN** `PULL_REQUEST_REVIEW_CACHE_DIR` is set to an empty string
- **THEN** `resolveCacheDirectory()` returns the same default as when the variable is not set

### Requirement: Package name normalization
The shared module SHALL export one function that normalizes an npm package name by trimming surrounding whitespace and lowercasing it. A module that matches a package name against advisory data SHALL compare names through it. A module that records installed packages SHALL keep each exact name, because npm treats names that differ only in case as different packages.

#### Scenario: Case and whitespace
- **WHEN** `' Haraka '` and `'@XMLDom/XMLDom'` are normalized
- **THEN** the results are `'haraka'` and `'@xmldom/xmldom'`

#### Scenario: Already normalized
- **WHEN** an already normalized name is normalized again
- **THEN** it is returned unchanged

#### Scenario: Matching an installed name against advisories
- **WHEN** a lockfile records `Haraka` and the advisory data lists `Haraka`
- **THEN** a lookup by the recorded name finds that advisory

### Requirement: String comparison
The shared module SHALL export one function that compares two strings by code unit order and returns -1, 0 or 1, never depending on the locale. A module SHALL NOT keep a code unit string comparator of its own. Wherever it passes a comparator to order paths, names or ids by code unit, that comparator SHALL be this function. The default sort of a string array is also code unit order and needs no comparator.

#### Scenario: Order by code unit
- **WHEN** `'B.ts'` and `'a.ts'` are compared, and `'CWE-1321'` and `'CWE-20'`
- **THEN** `'B.ts'` comes first and `'CWE-1321'` comes first, because uppercase and the digit 1 have the lower code units

#### Scenario: Equal strings
- **WHEN** a string is compared with itself
- **THEN** the result is 0

#### Scenario: Prefix first
- **WHEN** `'src/a'` and `'src/a.ts'` are compared
- **THEN** `'src/a'` comes first
