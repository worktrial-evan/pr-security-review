// a stub review pipeline with canned findings, the three snapshot cases it answers and the fixed clock the runner tests drive it with
import { basename, dirname } from 'node:path'
import type { BenchmarkCase } from '@/shared/benchmark'
import type { Finding } from '@/shared/finding'
import {
  codeReviewFindingSample,
  dependencyFindingSample,
  secretFindingSample,
} from '@/shared/finding.samples'
import type {
  ReviewOptions,
  ReviewPipeline,
  ReviewResult,
} from '@/shared/review'

// the three case ids, prefixed so the sorted order differs from the writing order
export const dependencyCaseId = 'a-01-dependency-lodash'
export const codeCaseId = 'b-02-code-sql'
export const cleanCaseId = 'c-03-clean-rename'

// a git case that points at a repository nothing can reach
export const gitCaseId = 'd-04-real-world-offline'
export const unreachableRepositoryUrl = 'https://127.0.0.1:9/none/none.git'

// a fake sha handed to the runner. not a real commit
export const fakeGitSha = '0123456789abcdef0123456789abcdef01234567'

// the time the clock of every run starts at
export const runStartedAt = new Date('2026-10-15T20:15:00.000Z')

// the fake app every case copies into base/, two files
export const fakeAppFiles: Record<string, string> = {
  'package.json': '{\n  "name": "fake-app",\n  "dependencies": {}\n}\n',
  'src/users.ts': 'export const users = []\nexport const query = "select 1"\n',
}

// the one-line change every case makes in head/
export const changedUsersFile =
  'export const users = []\nexport const query = "select * from users where id = " + id\n'

// the three snapshot cases: one dependency label, one code label and one clean
export const dependencyCase: BenchmarkCase = {
  id: dependencyCaseId,
  split: 'dev',
  category: 'dependency',
  isClean: false,
  description: 'bumps lodash to a vulnerable version',
  source: {
    kind: 'snapshot',
    directory: `benchmark/cases/${dependencyCaseId}`,
  },
  expected: [
    {
      detector: 'dependency',
      packageName: 'lodash',
      advisoryId: 'GHSA-35jh-r3h4-6jhm',
    },
  ],
}
export const codeCase: BenchmarkCase = {
  id: codeCaseId,
  split: 'dev',
  category: 'code',
  isClean: false,
  description: 'interpolates a user id into a sql query',
  source: { kind: 'snapshot', directory: `benchmark/cases/${codeCaseId}` },
  expected: [
    {
      detector: 'code-review',
      vulnerabilityType: 'CWE-89',
      file: 'src/users.ts',
      startLine: 2,
      endLine: 2,
    },
  ],
}
export const cleanCase: BenchmarkCase = {
  id: cleanCaseId,
  split: 'dev',
  category: 'clean',
  isClean: true,
  description: 'renames a variable',
  source: { kind: 'snapshot', directory: `benchmark/cases/${cleanCaseId}` },
  expected: [],
}
export const gitCase: BenchmarkCase = {
  id: gitCaseId,
  split: 'dev',
  category: 'real-world',
  isClean: false,
  description: 'a real-world case whose repository cannot be reached',
  source: {
    kind: 'git',
    repositoryUrl: unreachableRepositoryUrl,
    baseSha: fakeGitSha,
    headSha: fakeGitSha,
  },
  expected: [{ detector: 'code-review', vulnerabilityType: 'CWE-79' }],
}

// the findings the stub returns per case: one match for dependency, one match and one extra for code, one pre-existing for clean
const cannedFindingsByCaseId: Record<string, Finding[]> = {
  [dependencyCaseId]: [
    {
      ...dependencyFindingSample,
      file: 'package.json',
      startLine: 3,
      endLine: 3,
    },
  ],
  [codeCaseId]: [
    {
      ...codeReviewFindingSample,
      file: 'src/users.ts',
      startLine: 2,
      endLine: 2,
    },
    {
      ...codeReviewFindingSample,
      title: 'Command built from user input',
      vulnerabilityType: 'CWE-78',
      file: 'src/users.ts',
      startLine: 2,
      endLine: 2,
    },
  ],
  [cleanCaseId]: [{ ...secretFindingSample, isIntroducedByPullRequest: false }],
}

// the prompt versions and model ids every canned result reports
export const cannedPromptVersions = { 'code-review': 'v3', summarize: 'v1' }
export const cannedModelIds = { 'code-review': 'fake-review-model' }

// what one call of the stub recorded
export interface StubPipelineCall {
  caseId: string
  reviewOptions: ReviewOptions
}

// a stub pipeline together with the calls it recorded
export interface StubPipeline {
  pipeline: ReviewPipeline
  calls: StubPipelineCall[]
}

// which case the stub throws on, if any
export interface MakeStubPipelineOptions {
  throwingCaseId?: string
}

/**
 * Makes a pipeline that records its calls and answers each case with its canned findings.
 */
export function makeStubPipeline({
  throwingCaseId,
}: MakeStubPipelineOptions = {}): StubPipeline {
  // record every call and answer it with the canned findings of its case
  const calls: StubPipelineCall[] = []
  const pipeline: ReviewPipeline = async ({
    pullRequestSource,
    reviewOptions,
  }) => {
    // name the case by the directory its head tree sits in
    const headDirectory = await pullRequestSource.checkoutHead()
    const caseId = basename(dirname(headDirectory))
    calls.push({ caseId, reviewOptions })

    // fail the one case the stub is told to fail
    if (caseId === throwingCaseId) {
      throw new Error(`stub failure on ${caseId}`)
    }

    return makeReviewResult(cannedFindingsByCaseId[caseId] ?? [])
  }
  return { pipeline, calls }
}

/**
 * Makes a clock that starts at runStartedAt and advances one second per reading.
 */
export function makeClock(): () => Date {
  // count the readings and hand back the start time plus one second per earlier reading
  let readingCount = 0
  return () => {
    const reading = new Date(runStartedAt.getTime() + readingCount * 1000)
    readingCount += 1
    return reading
  }
}

// a review result with the given findings and the canned metadata
function makeReviewResult(findings: Finding[]): ReviewResult {
  return {
    metadata: {
      runId: 'stub-run',
      startedAt: runStartedAt.toISOString(),
      finishedAt: runStartedAt.toISOString(),
      baseSha: 'base',
      headSha: 'head',
      stepDurations: {},
      totalCostUsd: 0.01,
      promptVersions: cannedPromptVersions,
      modelIds: cannedModelIds,
      groundingRejectionCount: 0,
      suspectedPromptInjectionCount: 0,
      degradedSteps: [],
    },
    findings,
    errors: [],
  }
}
