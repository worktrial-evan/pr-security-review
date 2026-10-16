// tests the review pipeline end to end over a snapshot pull request. also tests a throwing detector and an aborted run and a run without the llm
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  createFakeLlmProvider,
  type FakeLlmProvider,
} from '@/llm/fake-llm-provider'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { detectSecrets } from '@/secrets/detect-secrets'
import type { FindingId } from '@/shared/finding'
import { reviewResultSchema } from '@/shared/review'
import { createLockfileMatcher, type RunOracle } from './matching-step'
import {
  createMemoryAuditSink,
  type MemoryAuditSink,
  makeTestClock,
  removeSnapshotPullRequest,
  type SnapshotPullRequest,
  testGithubToken,
  testReviewOptions,
  testRunSettings,
  writeSnapshotPullRequest,
} from './pipeline-fixtures'
import { type RunReviewOptions, runReview } from './run-review'
import { reviewSteps } from './run-step'

// the snapshot pull request and its source and the audit sink of the current test
let snapshotPullRequest: SnapshotPullRequest
let pullRequestSource: SnapshotPullRequestSource
let auditSink: MemoryAuditSink

beforeEach(async () => {
  snapshotPullRequest = await writeSnapshotPullRequest()
  pullRequestSource = new SnapshotPullRequestSource({
    baseDirectory: snapshotPullRequest.baseDirectory,
    headDirectory: snapshotPullRequest.headDirectory,
    contextLines: 3,
  })
  auditSink = createMemoryAuditSink()
})

afterEach(async () => {
  await pullRequestSource.dispose()
  await removeSnapshotPullRequest(snapshotPullRequest)
})

describe('runReview', () => {
  test('runs every step in order and returns a result that validates', async () => {
    // answer the summarize prompt with a grounded summary for the secret finding
    const secretFindingId = await findSecretFindingId()
    const llmProvider = createSummarizeProvider(secretFindingId)
    const reviewResult = await runTestReview({ llmProvider })

    // every step started and ended in order. each event has its hash and the end has a duration
    expect(listStepEvents('step-start')).toEqual([...reviewSteps])
    expect(listStepEvents('step-end')).toEqual([...reviewSteps])
    for (const event of auditSink.events) {
      if (event.kind === 'step-start') {
        expect(event.payload.inputHash).toMatch(/^[0-9a-f]{64}$/)
      }
      if (event.kind === 'step-end') {
        expect(event.payload.outputHash).toMatch(/^[0-9a-f]{64}$/)
        expect(event.durationMs).toBeGreaterThanOrEqual(0)
      }
    }

    // the result validates and holds the summarized secret finding and the advisory snapshot
    expect(reviewResultSchema.parse(reviewResult)).toEqual(reviewResult)
    expect(reviewResult.findings.map((finding) => finding.id)).toEqual([
      secretFindingId,
    ])
    expect(reviewResult.findings[0]?.summarySource).toBe('model')
    expect(reviewResult.metadata.advisorySnapshot?.entryCount).toBe(210)
    expect(Object.keys(reviewResult.metadata.stepDurations)).toEqual([
      ...reviewSteps,
    ])
    expect(reviewResult.metadata.promptVersions).toEqual({
      'code-review': '1',
      summarize: '1',
    })
    expect(reviewResult.metadata.modelIds).toEqual({
      'code-review': testReviewOptions.reviewModelId,
      summarize: testReviewOptions.summarizeModelId,
    })
    expect(reviewResult.errors).toEqual([])

    // nothing is degraded and the run finished
    expect(reviewResult.metadata.degradedSteps).toEqual([])
    expect(findNotes('run')).toContainEqual(
      expect.objectContaining({ message: 'run finished', stage: 'done' }),
    )
  })

  test('keeps a grounded review finding and counts rejections and injection attempts', async () => {
    // the reviewer reports one grounded finding, one finding with a vulnerabilityType off the allowlist and one injection attempt
    const tokenLine = `export const token = '${testGithubToken}'`
    const reviewFinding = {
      vulnerabilityType: 'CWE-89',
      title: 'Query text built from a constant',
      severity: 'high',
      confidence: 0.8,
      file: 'src/config.ts',
      startLine: 2,
      endLine: 2,
      evidence: [tokenLine],
      sourceToSink: 'The constant reaches the query.',
      remediation: 'Use a bound parameter.',
    }
    // the reviewer reads package.json then src/config.ts. the lockfile and the minified file are skipped
    const emptyReviewReply = {
      kind: 'output' as const,
      output: { findings: [], injectionAttempts: [] },
    }
    const llmProvider = createFakeLlmProvider({
      'code-review': [
        emptyReviewReply,
        {
          kind: 'output',
          output: {
            findings: [
              reviewFinding,
              { ...reviewFinding, vulnerabilityType: 'CWE-9999' },
            ],
            injectionAttempts: [{ file: 'src/config.ts', line: 2 }],
          },
        },
      ],
      summarize: [{ kind: 'http-error', statusCode: 400 }],
    })
    const reviewResult = await runTestReview({ llmProvider })

    // the grounded finding is in the result and the counters reached the metadata
    const reviewFindings = reviewResult.findings.filter(
      (finding) => finding.detector === 'code-review',
    )
    expect(reviewFindings.map((finding) => finding.file)).toEqual([
      'src/config.ts',
    ])
    expect(reviewResult.metadata.groundingRejectionCount).toBe(1)
    expect(reviewResult.metadata.suspectedPromptInjectionCount).toBe(1)
    expect(reviewResultSchema.safeParse(reviewResult).success).toBe(true)
  })

  test('notes the added line too long for the secrets scan', async () => {
    await runTestReview({ llmProvider: createSummarizeProvider('none') })

    expect(findNotes('secrets')).toEqual([
      {
        message: 'added line skipped for length',
        file: 'public/app.min.js',
        line: 1,
        length: 5000,
      },
    ])
  })

  test('degrades the run and continues when a detector throws', async () => {
    // run with a secrets detector that throws
    const reviewResult = await runTestReview({
      llmProvider: createSummarizeProvider('none'),
      detectors: {
        detectSecrets: () => {
          throw new Error('secrets detector broke')
        },
      },
    })

    // the error is recorded as non-fatal and the later steps still ran
    expect(reviewResult.errors).toEqual([
      { step: 'secrets', message: 'secrets detector broke', isFatal: false },
    ])
    expect(reviewResult.metadata.degradedSteps).toContain(
      'secrets: failed: secrets detector broke',
    )
    expect(listStepEvents('step-error')).toEqual(['secrets'])
    expect(listStepEvents('step-end')).toEqual(
      reviewSteps.filter((step) => step !== 'secrets'),
    )
    expect(reviewResultSchema.safeParse(reviewResult).success).toBe(true)
  })

  test('aborts with one fatal error when the pull request cannot be described', async () => {
    // make the source fail to describe the pull request
    pullRequestSource.describe = async () => {
      throw new Error('repository is gone')
    }
    const reviewResult = await runTestReview({
      llmProvider: createSummarizeProvider('none'),
    })

    // the run stopped at the first step with a fatal error and no findings
    expect(reviewResult.errors).toEqual([
      {
        step: 'describe-pull-request',
        message: 'repository is gone',
        isFatal: true,
      },
    ])
    expect(reviewResult.findings).toEqual([])
    expect(listStepEvents('step-start')).toEqual(['describe-pull-request'])
    expect(findNotes('run')).toContainEqual(
      expect.objectContaining({ message: 'run aborted', stage: 'failed' }),
    )
    expect(reviewResultSchema.safeParse(reviewResult).success).toBe(true)
  })

  test('skips code review and makes no model call with the llm off', async () => {
    // run with the llm off and a provider that records any call
    const llmProvider = createSummarizeProvider('none')
    const reviewResult = await runTestReview({
      llmProvider,
      reviewOptions: { ...testReviewOptions, isLlmEnabled: false },
    })

    // code review is skipped without degrading. summaries come from templates
    expect(llmProvider.requests).toEqual([])
    expect(reviewResult.metadata.degradedSteps).toEqual([])
    expect(findNotes('code-review')).toEqual([
      { message: 'code review skipped because the llm is disabled' },
    ])
    expect(reviewResult.findings[0]?.summarySource).toBe('template')
    expect(reviewResult.metadata.modelIds).toEqual({})
  })
})

// the options a test may change from the defaults
type TestReviewOptions = Pick<RunReviewOptions, 'llmProvider' | 'detectors'> &
  Partial<Pick<RunReviewOptions, 'reviewOptions'>>

// run the pipeline over the current snapshot with the test settings
async function runTestReview({
  llmProvider,
  detectors = {
    matchDependencies: createLockfileMatcher({ runOracle: runEmptyOracle }),
  },
  reviewOptions = testReviewOptions,
}: TestReviewOptions) {
  return runReview({
    pullRequestSource,
    reviewOptions,
    auditSink,
    runId: 'test-run',
    now: makeTestClock(),
    runSettings: testRunSettings,
    llmProvider,
    detectors,
  })
}

// an oracle that ran and matched nothing
const runEmptyOracle: RunOracle = async () => ({
  status: 'ran',
  packages: [],
  matches: [],
})

// find the id the secrets detector gives the token in the snapshot
async function findSecretFindingId(): Promise<FindingId> {
  const changedFiles = await pullRequestSource.listChangedFiles()
  const [secretFinding] = detectSecrets({ changedFiles })
  if (secretFinding === undefined) {
    throw new Error('the snapshot has no secret')
  }
  return secretFinding.id
}

// a provider whose reviewer finds nothing and whose summarizer writes one summary for the given finding id
function createSummarizeProvider(findingId: string): FakeLlmProvider {
  return createFakeLlmProvider({
    'code-review': [
      {
        kind: 'output',
        output: { findings: [], injectionAttempts: [] },
        usage: { inputTokens: 2000, outputTokens: 50 },
      },
    ],
    summarize: [
      {
        kind: 'output',
        output: {
          summaries: [
            {
              findingId,
              summary: 'A GitHub token was committed in the config file.',
              remediation: 'Revoke the token and read it from the environment.',
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 100 },
      },
    ],
  })
}

// the step names of every audit event of one kind in order
function listStepEvents(kind: string): string[] {
  return auditSink.events
    .filter((event) => event.kind === kind)
    .map((event) => event.step)
}

// the payloads of every note written under one step
function findNotes(step: string): Record<string, unknown>[] {
  return auditSink.events
    .filter((event) => event.kind === 'note' && event.step === step)
    .map((event) => event.payload)
}
