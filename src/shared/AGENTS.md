# shared module

## Purpose

The data contracts every module builds against: one zod schema with its inferred type per concept, so a finding, a pull request, a dependency, an advisory, an audit event, a run, a review and a benchmark case have one shape everywhere, plus the small rules every module shares: the cache directory, the npm package name and the string order.

## Public API

Every contract file exports `<name>Schema` and `type <Name> = z.infer<typeof <name>Schema>`. Enumerations are a const tuple exported beside a `z.enum` over it, so other modules can iterate them. Variants are `z.discriminatedUnion` on the kind field. Timestamps are ISO 8601 strings. Interfaces whose members are functions, and types holding a schema or a function, are plain TypeScript types.

### finding.ts

- `severities`, `severitySchema`, `Severity`: critical, high, medium, low, info
- `detectorKinds`, `detectorKindSchema`, `DetectorKind`: dependency, code-review, secrets
- `findingIdSchema`, `FindingId`: a 16-character lowercase hex string branded `FindingId`
- `summarySources`, `summarySourceSchema`, `SummarySource`: model, template
- `reachabilityKinds`, `reachabilityKindSchema`, `ReachabilityKind`: direct-imported, direct-unused, transitive
- `matcherAgreements`, `matcherAgreementSchema`, `MatcherAgreement`: both, handwritten-only, oracle-only, oracle-unavailable
- `findingBaseSchema`, `FindingBase`: id, detector, severity, confidence in 0..1, title, optional file, startLine and endLine, isIntroducedByPullRequest, optional summary, remediation and summarySource
- `dependencyFindingSchema`, `DependencyFinding`: the base plus packageName, version, advisoryId, aliases, isGithubReviewed, dependencyScope, reachability, importedBy, dependencyPath, fixedVersions, optional cvssScore, isVersionUnparseable, matcherAgreement
- `codeReviewFindingSchema`, `CodeReviewFinding`: the base plus vulnerabilityType, evidence, sourceToSink, promptVersion, model
- `secretFindingSchema`, `SecretFinding`: the base plus ruleId, fingerprint
- `findingSchema`, `Finding`: the discriminated union of the three variants on detector
- `CreateFindingIdOptions`, `createFindingId({ detector, stableKey })`: derives a `FindingId` as the first 16 hex characters of sha256 over `detector`, a newline and `stableKey`

### pull-request-source.ts

- `pullRequestReferenceSchema`, `PullRequestReference`: owner, repository, number, url
- `hunkLineKinds`, `hunkLineKindSchema`, `HunkLineKind`: added, removed, context
- `hunkLineSchema`, `HunkLine`: kind, headLine, text
- `hunkSchema`, `Hunk`: oldStart, oldLines, newStart, newLines, lines
- `changedFileStatuses`, `changedFileStatusSchema`, `ChangedFileStatus`: added, modified, deleted, renamed
- `addedLineSchema`, `AddedLine`: line, text
- `changedFileSchema`, `ChangedFile`: path, status, optional previousPath, hunks, addedLines, isBinary
- `pullRequestDescriptionSchema`, `PullRequestDescription`: baseSha, headSha, optional pullRequestReference
- `PullRequestSource`: describe, listChangedFiles, readFileAtBase, readFileAtHead, checkoutHead returning a directory path, dispose

### dependency.ts

- `dependencyScopes`, `dependencyScopeSchema`, `DependencyScope`: production, development
- `dependencyVersionSchema`, `DependencyVersion`: name, version, scope, isDirect, isWorkspace, isVersionUnparseable, optional realPackageName, dependencyKeys as name@version
- `lockfileKinds`, `lockfileKindSchema`, `LockfileKind`: bun, npm
- `dependencySetSchema`, `DependencySet`: lockfileKind, lockfilePath, versionsByDependency as a `Map` of name to versions, directDependencyNames as a `Set`
- `dependencyChangeSchema`, `DependencyChange`: name, fromVersion, toVersion
- `dependencyDiffSchema`, `DependencyDiff`: added, removed, changed, unchangedCount
- `DependencyGraph`: shortestPathTo returning name@version entries from a direct dependency

### advisory.ts

- `advisoryRangeTypes`, `advisoryRangeTypeSchema`, `AdvisoryRangeType`: SEMVER, ECOSYSTEM, GIT
- `advisoryRangeEventSchema`, `AdvisoryRangeEvent`: optional introduced, fixed, lastAffected
- `advisoryRangeSchema`, `AdvisoryRange`: type, events
- `affectedPackageSchema`, `AffectedPackage`: ecosystem, name, ranges, versions
- `advisoryReferenceSchema`, `AdvisoryReference`: type, url
- `advisorySchema`, `Advisory`: id, aliases, summary, details, optional severityScore and severityVector, affected, references, published, modified, optional withdrawn, isGithubReviewed
- `advisorySnapshotSchema`, `AdvisorySnapshot`: fetchedAt, sourceUrl, entryCount, sha256
- `AdvisoryStore`: getByPackage, snapshot

### audit.ts

- `auditEventKinds`, `auditEventKindSchema`, `AuditEventKind`: step-start, step-end, step-error, llm-call, finding, note
- `auditEventSchema`, `AuditEvent`: timestamp, runId, step, kind, payload, optional durationMs and costUsd
- `AuditSink`: write

### run-state.ts

- `activeRunStages`, `activeRunStageSchema`, `ActiveRunStage`: every stage but failed, in order from resolving-pull-request to done
- `runStages`, `runStageSchema`, `RunStage`: the active stages followed by failed
- `completedStageSchema`, `CompletedStage`: stage, durationMs
- `runErrorSchema`, `RunError`: message, optional step and stack
- `activeRunStateSchema`, `ActiveRunState`: a strict object with stage, runId, startedAt, completedStages
- `failedRunStateSchema`, `FailedRunState`: a strict object with stage failed, the same fields and error
- `runStateSchema`, `RunState`: the discriminated union of both on stage

### review.ts

- `reviewOptionsSchema`, `ReviewOptions`: isLlmEnabled, isCacheEnabled, isOffline, advisoryCacheDirectory, reviewModelId, summarizeModelId, contextLines, optional failOnSeverity
- `reviewMetadataSchema`, `ReviewMetadata`: runId, startedAt, finishedAt, optional pullRequestReference, baseSha, headSha, stepDurations, totalCostUsd, optional advisorySnapshot, promptVersions, modelIds, groundingRejectionCount, suspectedPromptInjectionCount, degradedSteps
- `stepErrorSchema`, `StepError`: step, message, isFatal
- `reviewResultSchema`, `ReviewResult`: metadata, findings, errors
- `ReviewPipelineOptions`, `ReviewPipeline`: a function of `{ pullRequestSource, reviewOptions, auditSink }` returning a promise of a `ReviewResult`

### llm.ts

- `promptTemplateSchema`, `PromptTemplate`: id, version, hash, text, variables
- `LlmGenerateOptions<T>`: promptId, promptVersion, promptHash, system, user, schema as a zod schema for T, optional modelId
- `llmUsageSchema`, `LlmUsage`: inputTokens, outputTokens
- `llmGenerateResultSchema`, `LlmGenerateResult<T>`: output narrowed to T, usage, costUsd or null, isCacheHit, durationMs
- `LlmClient`: generate

### benchmark.ts

- `benchmarkSplits`, `benchmarkSplitSchema`, `BenchmarkSplit`: dev, test
- `benchmarkCategories`, `benchmarkCategorySchema`, `BenchmarkCategory`: dependency, code, secrets, clean, real-world
- `snapshotBenchmarkSourceSchema`, `SnapshotBenchmarkSource`: a strict object with kind snapshot and directory
- `gitBenchmarkSourceSchema`, `GitBenchmarkSource`: a strict object with kind git, repositoryUrl, baseSha, headSha
- `benchmarkSourceSchema`, `BenchmarkSource`: the discriminated union of both on kind
- `expectedFindingSchema`, `ExpectedFinding`: detector, optional packageName, advisoryId, vulnerabilityType, file, startLine, endLine, severity
- `benchmarkCaseSchema`, `BenchmarkCase`: id, split, category, isClean, description, source, expected
- `scoreTripleSchema`, `ScoreTriple`: precision, recall, f1
- `benchmarkCaseResultSchema`, `BenchmarkCaseResult`: caseId, truePositives, falsePositives, falseNegatives
- `benchmarkScoreSchema`, `BenchmarkScore`: precision, recall, f1, byDetector, byCategory, falsePositivesOnClean, totalCostUsd, totalDurationMs, caseResults

### finding.samples.ts

- `dependencyFindingSample`, `codeReviewFindingSample`, `secretFindingSample`: one valid finding per detector variant for the tests in this module

### cache-directory.ts

- `cacheDirectoryEnvironmentVariable`: the name `PULL_REQUEST_REVIEW_CACHE_DIR`, so callers and tests set the variable through one constant
- `resolveCacheDirectory()`: returns the directory that holds every cache. The variable's value when it is set and non-empty, else `.cache/pull-request-review` under the home directory. Creates nothing on disk

### package-name.ts

- `normalizePackageName(packageName)`: returns an npm package name trimmed and lowercased. A module that matches a package name against advisory data compares names through it, so a name from a lockfile and a name from an advisory compare equal

### compare-strings.ts

- `CompareStringsOptions`, `compareStrings({ first, second })`: returns -1, 0 or 1 by code unit order. The lockfile, pull-request-source and code-review modules order names, versions, paths and CWE ids through it instead of keeping a comparator of their own, so those orders never depend on the locale

## Inputs and outputs

The contract files read nothing and produce nothing at runtime. Other modules parse a value through a schema at their boundary, for example where a detector emits a finding, where the audit sink receives an event, where a benchmark case is loaded from disk or where a model response is validated, and carry the inferred type inside. `createFindingId` takes a detector kind and a stable key and returns a `FindingId`. `resolveCacheDirectory` reads `PULL_REQUEST_REVIEW_CACHE_DIR` from the environment and returns a path outside the repository; the module that owns a cache creates its own subdirectory under it.

## Allowed imports

Nothing. The shared module imports no other module under `src/`.

Bun and Node built-ins and npm packages are always allowed.

## Files

- `finding.ts`: severities, detector kinds, the branded finding id, the finding variants, `findingSchema` and `createFindingId`
- `finding.test.ts`: one round trip per variant, confidence 1.5 rejected, a variant field required on its own member only, the id brand, and ids that are deterministic, 16 lowercase hex and differ by detector
- `finding.samples.ts`: one valid sample finding per detector variant, shared by the finding and review tests
- `pull-request-source.ts`: the pull request reference, hunk lines and hunks, changed files, the pull request description and the `PullRequestSource` interface
- `pull-request-source.test.ts`: a renamed file round-trips with its previous path, a pull request description round-trips, an invalid hunk line kind is rejected
- `dependency.ts`: dependency scopes, dependency versions, the lockfile kinds, the dependency set with its `Map` and `Set`, the dependency diff and the `DependencyGraph` interface
- `dependency.test.ts`: a set with two versions of one package round-trips with `Map` and `Set` contents intact, a diff round-trips
- `advisory.ts`: the OSV subset of an advisory, affected packages with range types, the advisory snapshot and the `AdvisoryStore` interface
- `advisory.test.ts`: an advisory and a snapshot round-trip, an invalid range type is rejected
- `audit.ts`: the audit event kinds, the audit event and the `AuditSink` interface
- `audit.test.ts`: an llm-call event with a cost round-trips, an invalid kind is rejected
- `run-state.ts`: the ordered run stages, completed stages, the run error and the run state union with the error only on failed
- `run-state.test.ts`: failed comes last, both states round-trip, a failed state requires an error, an active state with an error is rejected
- `review.ts`: review options, review metadata, step errors, the review result and the `ReviewPipeline` type
- `review.test.ts`: the options round-trip, a result with one finding per detector and one step error round-trips
- `llm.ts`: prompt templates, `LlmGenerateOptions`, usage, the generate result and the `LlmClient` interface
- `llm.test.ts`: a prompt template round-trips, a result with costUsd null keeps the null
- `benchmark.ts`: benchmark splits and categories, the snapshot and git sources, expected findings, benchmark cases, score triples, case results and the benchmark score
- `benchmark.test.ts`: a snapshot case, a git case and a score round-trip, a source mixing both shapes is rejected
- `cache-directory.ts`: the cache directory environment variable name and `resolveCacheDirectory`, which keeps every cache outside the repository so worktrees share it
- `cache-directory.test.ts`: the variable set returns exactly that path, unset falls back to `.cache/pull-request-review` under the home directory, an empty string falls back the same way. The variable is saved before and restored after each test
- `package-name.ts`: `normalizePackageName`, the npm package name rule for matching against advisory data
- `package-name.test.ts`: case, surrounding whitespace, a scoped name and an already normalized name
- `compare-strings.ts`: `compareStrings`, the code unit order of two strings
- `compare-strings.test.ts`: equal strings, the sign of each order, uppercase before lowercase, `CWE-1321` before `CWE-20`, a prefix first and a non-ASCII letter after `z`
- `tsconfig.json`: the module's composite TypeScript project. It references no other module
- `AGENTS.md`: this file

## Invariants

- No file in `src/shared` imports from any other module under `src/`. Files inside the module import each other by relative path.
- Every exported zod schema has a round-trip test: a representative sample parses to a value that deep-equals the sample, with nothing dropped, added or coerced.
- Every enumeration is a const tuple exported beside its `z.enum`, and the tuple is the one place the values are listed.
- `runStages` is `activeRunStages` followed by `failed`, so the order used for stage transitions is the order of the tuple.
- A `FindingId` is only made by `findingIdSchema` or `createFindingId`. `createFindingId` is deterministic: the same detector and stable key always give the same id, and the same stable key under two detectors gives two ids.
- The run state objects are strict, so an error can only sit on a failed run. The benchmark source objects are strict, so a source cannot mix the snapshot and git shapes.
- `src/shared/**` is a frozen tree. A field is added, renamed or removed only through a change whose proposal names `src/shared` in its Impact section, never by a module change.
- `normalizePackageName` is the only npm package name rule in the codebase, and no module keeps its own copy. It applies where a name is matched against advisory data. A module that records installed packages, such as the lockfile parser, keeps each exact name, because npm treats names that differ only in case as different packages.
- `resolveCacheDirectory` never returns a path inside the repository and never creates a directory. It reads one environment variable and nothing else.
- `compareStrings` is the one code unit string comparator in the codebase, and no module keeps its own copy: lockfile, pull-request-source and code-review order names, versions, paths and CWE ids through it, so those orders stay the same on every machine. A default sort of a string array is the same order and needs no comparator. The advisories module orders advisory ids and the report module orders table cells with `localeCompare`, outside this rule.

## How to test

`bun test src/shared` runs every round-trip and rejection test in the module. `bun check src/shared` type-checks it, and `bunx biome check src/shared` lints and format-checks it.

## Known gaps

- Only the finding id is branded. `runId` and the shas are plain strings.
- `HunkLine.headLine` is a number on every line, including removed lines, which have no line of their own in the head revision. The pull-request-source module decides what it stores there.
- `AdvisoryRange` has no `repository` field, so a GIT range cannot name its repository yet.
- `DependencyGraph` has only `shortestPathTo`. Other graph queries are added when a module needs them.
