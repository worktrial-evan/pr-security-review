// the review pipeline: runs every step of one pull request review in order and returns the validated review result
import type { LlmProvider } from '@/llm/llm-provider'
import { advanceRunState } from '@/run-state/run-state'
import { detectSecrets } from '@/secrets/detect-secrets'
import type { AdvisoryStore } from '@/shared/advisory'
import type { Finding } from '@/shared/finding'
import type { PullRequestDescription } from '@/shared/pull-request-source'
import type {
  ReviewPipeline,
  ReviewPipelineOptions,
  ReviewResult,
} from '@/shared/review'
import {
  type AdvisoryLoad,
  loadAdvisories,
  type RefreshAdvisoryCache,
} from './advisory-step'
import { assembleReviewResult } from './assemble-step'
import {
  type CodeReviewOutput,
  emptyCodeReviewOutput,
  type ReviewCode,
  reviewCodeWithReviewer,
  runCodeReview,
} from './code-review-step'
import { type CollectedFiles, collectFiles } from './collect-files-step'
import { dedupeFindings } from './dedupe-step'
import { describePullRequest } from './describe-step'
import { createReviewLlmClients, type ReviewLlmClients } from './llm-clients'
import { type ParsedLockfiles, parseLockfiles } from './lockfile-step'
import {
  createLockfileMatcher,
  type DependencyMatching,
  type MatchDependencies,
} from './matching-step'
import { classifyDependencyFindings } from './reachability-step'
import { loadReviewSettings, type RunSettings } from './review-settings'
import {
  addDegradedStep,
  createRunId,
  createRunRecord,
  type RunRecord,
  writeRunNote,
} from './run-record'
import { ReviewAbortedError, runStep } from './run-step'
import { type DetectSecrets, runSecretsDetector } from './secrets-step'
import { summarizeReviewFindings } from './summarize-step'

// the detectors the pipeline runs. tests replace any of them
export interface ReviewDetectors {
  matchDependencies: MatchDependencies
  detectSecrets: DetectSecrets
  reviewCode: ReviewCode
}

// the detectors a run uses unless the caller replaces one
export const defaultReviewDetectors: ReviewDetectors = {
  matchDependencies: createLockfileMatcher(),
  detectSecrets,
  reviewCode: reviewCodeWithReviewer,
}

// the pipeline options plus what a caller or a test may fix for one run. every extra field has a default
export interface RunReviewOptions extends ReviewPipelineOptions {
  runId?: string
  now?: () => Date
  runSettings?: RunSettings
  llmProvider?: LlmProvider
  llmCacheDirectory?: string
  refreshAdvisoryCache?: RefreshAdvisoryCache
  detectors?: Partial<ReviewDetectors>
}

// everything the steps of one run share
interface ReviewRun {
  options: RunReviewOptions
  runRecord: RunRecord
  runSettings: RunSettings
  detectors: ReviewDetectors
  llmClients: ReviewLlmClients | undefined
}

// what the steps before dedupe produced
interface DetectorOutcome {
  findings: Finding[]
  advisoryStore: AdvisoryStore | undefined
}

/**
 * Reviews one pull request end to end and returns a result that validates against the review result schema.
 */
export async function runReview(
  options: RunReviewOptions,
): Promise<ReviewResult> {
  // start the run record. resolve the settings and detectors and model clients
  const now = options.now ?? (() => new Date())
  const runId = options.runId ?? createRunId(now())
  const runRecord = createRunRecord({
    runId,
    auditSink: options.auditSink,
    now,
  })
  const runSettings = options.runSettings ?? (await loadRunSettings())
  const reviewRun: ReviewRun = {
    options,
    runRecord,
    runSettings,
    detectors: { ...defaultReviewDetectors, ...options.detectors },
    llmClients: createReviewLlmClients({
      runRecord,
      reviewOptions: options.reviewOptions,
      runSettings,
      llmProvider: options.llmProvider,
      llmCacheDirectory: options.llmCacheDirectory,
    }),
  }

  // describe the pull request. a failure aborts the run
  let pullRequestDescription: PullRequestDescription | undefined
  try {
    pullRequestDescription = await runStep({
      runRecord,
      step: 'describe-pull-request',
      input: {},
      run: () => describePullRequest(options.pullRequestSource),
      isFatal: true,
    })
    const collectedFiles = await runCollectFilesStep(reviewRun)

    // run the detectors. then dedupe and summarize and assemble
    const detectorOutcome = await runDetectorSteps({
      reviewRun,
      collectedFiles,
    })
    return await runFindingSteps({
      reviewRun,
      detectorOutcome,
      pullRequestDescription,
    })
  } catch (error) {
    return abortRun({ runRecord, error, pullRequestDescription })
  }
}

// runReview typed as the shared pipeline contract
export const reviewPipeline: ReviewPipeline = runReview

// read the run settings from the config files
async function loadRunSettings(): Promise<RunSettings> {
  const { reviewOptions, ...runSettings } = await loadReviewSettings()
  return runSettings
}

// list the changed files and degrade the run by every file the limits withhold. a failure aborts the run
async function runCollectFilesStep(
  reviewRun: ReviewRun,
): Promise<CollectedFiles> {
  const { runRecord, options, runSettings } = reviewRun
  const collectedFiles = await runStep({
    runRecord,
    step: 'collect-files',
    input: { limits: runSettings.limits },
    run: () =>
      collectFiles({
        pullRequestSource: options.pullRequestSource,
        limits: runSettings.limits,
      }),
    isFatal: true,
  })
  for (const withheldFile of collectedFiles.withheldFiles) {
    addDegradedStep({
      runRecord,
      step: 'collect-files',
      reason: `withheld ${withheldFile.path} from secrets and code review: ${withheldFile.reason}`,
    })
  }
  return collectedFiles
}

// the run and the files its detectors read
interface RunDetectorStepsOptions {
  reviewRun: ReviewRun
  collectedFiles: CollectedFiles
}

// run the dependency steps and secrets and code review. gather their findings
async function runDetectorSteps({
  reviewRun,
  collectedFiles,
}: RunDetectorStepsOptions): Promise<DetectorOutcome> {
  const { runRecord, detectors } = reviewRun

  // find vulnerable dependencies the pull request introduces
  const { dependencyFindings, advisoryStore } = await runDependencySteps({
    reviewRun,
    collectedFiles,
  })

  // scan the added lines for secrets
  const secretFindings = await runStep({
    runRecord,
    step: 'secrets',
    input: collectedFiles.reviewedFiles,
    run: (reviewedFiles) =>
      runSecretsDetector({
        reviewedFiles,
        detectSecrets: detectors.detectSecrets,
        runRecord,
      }),
    isFatal: false,
    fallback: [],
  })

  // review the changed code
  const codeReviewOutput = await runCodeReviewStep({
    reviewRun,
    collectedFiles,
  })
  return {
    findings: [
      ...dependencyFindings,
      ...secretFindings,
      ...codeReviewOutput.findings,
    ],
    advisoryStore,
  }
}

// the dependency findings and the store they were matched against
interface DependencyOutcome {
  dependencyFindings: Finding[]
  advisoryStore: AdvisoryStore | undefined
}

// parse the lockfiles and load the advisories. then match and classify reachability
async function runDependencySteps({
  reviewRun,
  collectedFiles,
}: RunDetectorStepsOptions): Promise<DependencyOutcome> {
  const { runRecord, options, runSettings, detectors } = reviewRun
  const { reviewOptions, pullRequestSource } = options

  // parse and diff every changed lockfile
  const parsedLockfiles = await runStep({
    runRecord,
    step: 'parse-lockfiles',
    input: collectedFiles.changedFiles,
    run: (changedFiles) => parseLockfiles({ pullRequestSource, changedFiles }),
    isFatal: false,
    fallback: {
      lockfileChanges: [],
      unsupportedLockfilePaths: [],
    } satisfies ParsedLockfiles,
  })
  for (const unsupportedLockfilePath of parsedLockfiles.unsupportedLockfilePaths) {
    addDegradedStep({
      runRecord,
      step: 'parse-lockfiles',
      reason: `unsupported lockfile ${unsupportedLockfilePath}`,
    })
  }

  // load the advisories only when a lockfile changed
  const advisoryLoad = await runStep({
    runRecord,
    step: 'load-advisories',
    input: {
      advisoryCacheDirectory: reviewOptions.advisoryCacheDirectory,
      isOffline: reviewOptions.isOffline,
    },
    run: () =>
      loadAdvisories({
        isNeeded: parsedLockfiles.lockfileChanges.length > 0,
        advisoryCacheDirectory: reviewOptions.advisoryCacheDirectory,
        advisoryStaleHours: runSettings.advisoryStaleHours,
        isOffline: reviewOptions.isOffline,
        refreshAdvisoryCache: options.refreshAdvisoryCache,
      }),
    isFatal: false,
    fallback: { kind: 'not-needed' } satisfies AdvisoryLoad,
  })
  const advisoryStore =
    advisoryLoad.kind === 'loaded' ? advisoryLoad.advisoryStore : undefined

  // match the changed lockfiles against the advisories
  const dependencyMatching = await runStep({
    runRecord,
    step: 'match-dependencies',
    input: parsedLockfiles.lockfileChanges,
    run: (lockfileChanges) =>
      detectors.matchDependencies({
        lockfileChanges,
        advisoryStore,
        pullRequestSource,
        runRecord,
      }),
    isFatal: false,
    fallback: {
      lockfileMatches: [],
      degradedReasons: [],
    } satisfies DependencyMatching,
  })
  for (const reason of dependencyMatching.degradedReasons) {
    addDegradedStep({ runRecord, step: 'match-dependencies', reason })
  }

  // classify how the head checkout reaches each match
  const dependencyFindings = await runStep({
    runRecord,
    step: 'reachability',
    input: dependencyMatching.lockfileMatches,
    run: (lockfileMatches) =>
      classifyDependencyFindings({
        lockfileMatches,
        pullRequestSource,
        auditSink: runRecord.auditSink,
        runId: runRecord.runId,
      }),
    isFatal: false,
    fallback: [],
  })
  return { dependencyFindings, advisoryStore }
}

// run the code reviewer. record its prompt and model and counters and degraded reasons
async function runCodeReviewStep({
  reviewRun,
  collectedFiles,
}: RunDetectorStepsOptions): Promise<CodeReviewOutput> {
  const { runRecord, options, runSettings, detectors, llmClients } = reviewRun

  // review the files the limits kept
  const codeReviewOutput = await runStep({
    runRecord,
    step: 'code-review',
    input: collectedFiles.reviewedFiles,
    run: (reviewedFiles) =>
      runCodeReview({
        reviewedFiles,
        reviewCode: detectors.reviewCode,
        reviewLlmClient: llmClients?.reviewLlmClient,
        reviewOptions: options.reviewOptions,
        reviewPromptVersion: runSettings.reviewPromptVersion,
        runRecord,
      }),
    isFatal: false,
    fallback: emptyCodeReviewOutput,
  })

  // record what the review used and found
  for (const reason of codeReviewOutput.degradedReasons) {
    addDegradedStep({ runRecord, step: 'code-review', reason })
  }
  if (codeReviewOutput.promptVersion !== undefined) {
    runRecord.promptVersions['code-review'] = codeReviewOutput.promptVersion
    runRecord.modelIds['code-review'] = options.reviewOptions.reviewModelId
  }
  runRecord.groundingRejectionCount += codeReviewOutput.groundingRejectionCount
  runRecord.suspectedPromptInjectionCount +=
    codeReviewOutput.injectionAttemptCount
  return codeReviewOutput
}

// the run with the detector findings and the pull request description
interface RunFindingStepsOptions {
  reviewRun: ReviewRun
  detectorOutcome: DetectorOutcome
  pullRequestDescription: PullRequestDescription
}

// dedupe and summarize the findings. then assemble the result and finish the run
async function runFindingSteps({
  reviewRun,
  detectorOutcome,
  pullRequestDescription,
}: RunFindingStepsOptions): Promise<ReviewResult> {
  const { runRecord } = reviewRun

  // drop findings another detector already reports and note each drop
  const dedupedFindings = await runStep({
    runRecord,
    step: 'dedupe-findings',
    input: detectorOutcome.findings,
    run: async (findings) => dedupeFindings(findings),
    isFatal: false,
    fallback: { keptFindings: detectorOutcome.findings, droppedFindings: [] },
  })
  for (const { finding, reason } of dedupedFindings.droppedFindings) {
    await writeRunNote({
      runRecord,
      step: 'dedupe-findings',
      payload: { message: 'finding dropped', findingId: finding.id, reason },
    })
  }

  // summarize the kept findings
  const summarizedFindings = await runSummarizeStep({
    reviewRun,
    findings: dedupedFindings.keptFindings,
    advisoryStore: detectorOutcome.advisoryStore,
  })

  // assemble the result and audit every finding in it. then finish the run
  const reviewResult = await runStep({
    runRecord,
    step: 'assemble-result',
    input: summarizedFindings,
    run: async (findings) =>
      assembleReviewResult({
        runRecord,
        pullRequestDescription,
        findings,
        advisorySnapshot: detectorOutcome.advisoryStore?.snapshot,
      }),
    isFatal: true,
  })
  await writeFindingEvents({ runRecord, reviewResult })
  await finishRun(runRecord)

  // add the assemble step's own duration. it is known only once the step has ended
  reviewResult.metadata.stepDurations = { ...runRecord.stepDurations }
  return reviewResult
}

// the run and the findings to summarize. also the store their advisories come from
interface RunSummarizeStepOptions {
  reviewRun: ReviewRun
  findings: Finding[]
  advisoryStore: AdvisoryStore | undefined
}

// summarize the findings. record the prompt and model and counts the summaries used
async function runSummarizeStep({
  reviewRun,
  findings,
  advisoryStore,
}: RunSummarizeStepOptions): Promise<Finding[]> {
  const { runRecord, options, llmClients } = reviewRun
  const { summarizeModelId } = options.reviewOptions

  // summarize with the model or from templates
  const summarizeStepOutput = await runStep({
    runRecord,
    step: 'summarize',
    input: findings,
    run: (unsummarizedFindings) =>
      summarizeReviewFindings({
        findings: unsummarizedFindings,
        advisoryStore,
        summarizeLlmClient: llmClients?.summarizeLlmClient,
        summarizeModelId,
      }),
    isFatal: false,
    fallback: {
      findings,
      promptId: undefined,
      promptVersion: undefined,
      groundingRejectionCount: 0,
      failedModelCallCount: 0,
    },
  })

  // record the prompt and model the summaries used. degrade the step when calls failed
  const { promptId, promptVersion, failedModelCallCount } = summarizeStepOutput
  if (promptId !== undefined && promptVersion !== undefined) {
    runRecord.promptVersions[promptId] = promptVersion
    runRecord.modelIds.summarize = summarizeModelId
  }
  runRecord.groundingRejectionCount +=
    summarizeStepOutput.groundingRejectionCount
  if (failedModelCallCount > 0) {
    addDegradedStep({
      runRecord,
      step: 'summarize',
      reason: `${failedModelCallCount} model calls failed and their findings use template summaries`,
    })
  }
  return summarizeStepOutput.findings
}

// the record and the result whose findings to audit
interface WriteFindingEventsOptions {
  runRecord: RunRecord
  reviewResult: ReviewResult
}

// write one finding event per finding in the result
async function writeFindingEvents({
  runRecord,
  reviewResult,
}: WriteFindingEventsOptions): Promise<void> {
  for (const finding of reviewResult.findings) {
    await runRecord.auditSink.write({
      timestamp: runRecord.now().toISOString(),
      runId: runRecord.runId,
      step: 'assemble-result',
      kind: 'finding',
      payload: { finding },
    })
  }
}

// move the run to done and note how it ended
async function finishRun(runRecord: RunRecord): Promise<void> {
  runRecord.runState = advanceRunState({
    state: runRecord.runState,
    to: 'done',
    now: runRecord.now(),
  })
  await writeRunNote({
    runRecord,
    step: 'run',
    payload: {
      message: 'run finished',
      stage: runRecord.runState.stage,
      completedStages: runRecord.runState.completedStages,
    },
  })
}

// the record and what was thrown. also the description when the run got that far
interface AbortRunOptions {
  runRecord: RunRecord
  error: unknown
  pullRequestDescription: PullRequestDescription | undefined
}

// fail the run on an aborted step and return a result holding only the fatal error. anything else is rethrown
async function abortRun({
  runRecord,
  error,
  pullRequestDescription,
}: AbortRunOptions): Promise<ReviewResult> {
  if (!(error instanceof ReviewAbortedError)) {
    throw error
  }

  // record the fatal error and move the run to failed
  runRecord.errors.push({
    step: error.step,
    message: error.message,
    isFatal: true,
  })
  runRecord.runState = advanceRunState({
    state: runRecord.runState,
    to: 'failed',
    error: { message: error.message, step: error.step },
    now: runRecord.now(),
  })
  await writeRunNote({
    runRecord,
    step: 'run',
    payload: {
      message: 'run aborted',
      stage: 'failed',
      failedStep: error.step,
    },
  })

  return assembleReviewResult({
    runRecord,
    pullRequestDescription,
    findings: [],
    advisorySnapshot: undefined,
  })
}
