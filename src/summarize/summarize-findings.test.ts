// tests summarizeFindings on the fake provider: skipped pre-existing findings, retry then fallback, batching, fences and cost
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmReply,
} from '@/llm/fake-llm-provider'
import { createLlmClient } from '@/llm/llm-client'
import type { ModelPrices } from '@/llm/model-config'
import { describeFence } from '@/prompts/fence-untrusted'
import { createFindingId, type Finding } from '@/shared/finding'
import type { LlmClient } from '@/shared/llm'
import { summarizeFindings } from './summarize-findings'
import {
  advisoriesByIdSample,
  codeReviewFindingSample,
  scaFindingSample,
  secretFindingSample,
} from './summary.samples'
import { buildSummaryPacket } from './summary-packet'

// the model the tests price, at 1 USD per million input tokens and 5 per million output tokens
const testModelId = 'anthropic/claude-haiku-5-5'
const testPrices: ModelPrices = {
  [testModelId]: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 5 },
}

// the usage every canned reply reports, which costs 0.002 USD
const testUsage = { inputTokens: 1000, outputTokens: 200 }
const costPerCallUsd = 0.002

// grounded and ungrounded text for the dependency and code findings
const groundedScaText = {
  summary: 'lodash 4.17.20 has a command injection in its template function.',
  remediation: 'Upgrade lodash to 4.17.21.',
}
const ungroundedScaText = {
  summary: 'lodash 4.17.20 has a command injection.',
  remediation: 'Upgrade lodash to 9.9.9.',
}
const groundedCodeText = {
  summary: 'The id query parameter reaches the sql string without a binding.',
  remediation: 'Pass the id as a bound parameter.',
}
const ungroundedCodeText = {
  summary: 'The id reaches the query.',
  remediation: 'See https://example.com/sql-injection for the fix.',
}

// a temporary cache directory per test, removed afterwards
let cacheDirectory = ''
beforeEach(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'summarize-test-'))
})
afterEach(async () => {
  await rm(cacheDirectory, { recursive: true, force: true })
})

// build a real llm client on a fake provider with canned summarize replies
function createTestClient(fakeLlmReplies: FakeLlmReply[]): {
  fakeLlmProvider: FakeLlmProvider
  client: LlmClient
} {
  const fakeLlmProvider = createFakeLlmProvider({ summarize: fakeLlmReplies })
  const client = createLlmClient({
    modelId: testModelId,
    prices: testPrices,
    auditSink: { write: async () => {} },
    runId: 'run-1',
    isCacheEnabled: false,
    cacheDirectory,
    provider: fakeLlmProvider,
  })
  return { fakeLlmProvider, client }
}

// a canned reply holding one summary per finding id
function summariesReply(
  textsByFindingId: Record<string, { summary: string; remediation: string }>,
): FakeLlmReply {
  const summaries = Object.entries(textsByFindingId).map(
    ([findingId, text]) => ({ findingId, ...text }),
  )
  return { kind: 'output', output: { summaries }, usage: testUsage }
}

// a copy of the sample dependency finding with its own id
function createScaFinding(index: number): Finding {
  const id = createFindingId({ detector: 'sca', stableKey: `lodash-${index}` })
  return { ...scaFindingSample, id }
}

describe('summarizeFindings', () => {
  test('gives pre-existing findings a template one-liner without a model call', async () => {
    // build a client with no replies and a pre-existing dependency finding
    const { fakeLlmProvider, client } = createTestClient([])
    const preExistingScaFinding = {
      ...scaFindingSample,
      isIntroducedByPullRequest: false,
    }

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [secretFindingSample, preExistingScaFinding],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // check the calls and the summarized findings
    expect(fakeLlmProvider.requests).toHaveLength(0)
    expect(summarizeFindingsResult.modelCallCount).toBe(0)
    expect(
      summarizeFindingsResult.findings.map((finding) => finding.summarySource),
    ).toEqual(['template', 'template'])
    expect(summarizeFindingsResult.findings[1]?.summary).toBe(
      'lodash 4.17.20 with advisory GHSA-35jh-r3h4-6jhm was present before this pull request.',
    )
  })

  test('keeps input order and sends only introduced findings to the model', async () => {
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply({ [scaFindingSample.id]: groundedScaText }),
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [secretFindingSample, scaFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // check the calls and the summarized findings
    expect(fakeLlmProvider.requests).toHaveLength(1)
    expect(fakeLlmProvider.requests[0]?.user).not.toContain(
      secretFindingSample.id,
    )
    expect(
      summarizeFindingsResult.findings.map((finding) => finding.id),
    ).toEqual([secretFindingSample.id, scaFindingSample.id])
    expect(summarizeFindingsResult.findings[1]).toMatchObject({
      ...groundedScaText,
      summarySource: 'model',
    })
    expect(summarizeFindingsResult.promptId).toBe('summarize')
    expect(summarizeFindingsResult.promptVersion).toBe('1')
  })

  test('retries a rejected summary once with its violations and keeps the grounded retry', async () => {
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply({ [scaFindingSample.id]: ungroundedScaText }),
      summariesReply({ [scaFindingSample.id]: groundedScaText }),
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [scaFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // check the calls and the summarized findings
    expect(fakeLlmProvider.requests).toHaveLength(2)
    expect(fakeLlmProvider.requests[1]?.user).toContain(
      '- version 9.9.9 is not in the input',
    )
    expect(summarizeFindingsResult.findings[0]).toMatchObject({
      ...groundedScaText,
      summarySource: 'model',
    })
    expect(summarizeFindingsResult.groundingRejectionCount).toBe(1)
  })

  test('falls back to the template after a second rejection with no third call', async () => {
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply({ [scaFindingSample.id]: ungroundedScaText }),
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [scaFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // check the calls and the summarized findings
    expect(fakeLlmProvider.requests).toHaveLength(2)
    expect(summarizeFindingsResult.findings[0]).toMatchObject({
      summary:
        'lodash 4.17.20 is affected by GHSA-35jh-r3h4-6jhm. It is a transitive dependency through @acme/render@2.1.0.',
      remediation: 'Upgrade lodash to 4.17.21 or later.',
      summarySource: 'template',
    })
    expect(summarizeFindingsResult.groundingRejectionCount).toBe(2)
  })

  test('retries only the rejected finding of a batch', async () => {
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply({
        [scaFindingSample.id]: groundedScaText,
        [codeReviewFindingSample.id]: ungroundedCodeText,
      }),
      summariesReply({ [codeReviewFindingSample.id]: groundedCodeText }),
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [scaFindingSample, codeReviewFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // the retry names only the code finding
    const retryUser = fakeLlmProvider.requests[1]?.user ?? ''
    expect(retryUser).toContain(`## Finding ${codeReviewFindingSample.id}`)
    expect(retryUser).not.toContain(`## Finding ${scaFindingSample.id}`)

    // both findings keep model text
    expect(summarizeFindingsResult.findings[0]).toMatchObject(groundedScaText)
    expect(summarizeFindingsResult.findings[1]).toMatchObject({
      ...groundedCodeText,
      summarySource: 'model',
    })
  })

  test('fences evidence and advisory text and describes each fence in the system prompt', async () => {
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply({
        [scaFindingSample.id]: groundedScaText,
        [codeReviewFindingSample.id]: groundedCodeText,
      }),
    ])

    // summarize the findings
    await summarizeFindings({
      findings: [scaFindingSample, codeReviewFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // build the same fences the summarizer builds
    const expectedFences = [scaFindingSample, codeReviewFindingSample].flatMap(
      (finding) =>
        buildSummaryPacket({ finding, advisoriesById: advisoriesByIdSample })
          .fences,
    )
    expect(expectedFences.map((fence) => fence.label)).toEqual([
      'advisory',
      'evidence',
    ])

    // each fence sits in the user text and its description in the system prompt
    const providerRequest = fakeLlmProvider.requests[0]
    for (const fence of expectedFences) {
      expect(providerRequest?.user).toContain(fence.text)
      expect(providerRequest?.system).toContain(describeFence(fence))
      expect(providerRequest?.system).not.toContain(fence.text)
    }
  })

  test('falls back to templates when the model call fails', async () => {
    // answer with the canned replies
    const { client } = createTestClient([
      { kind: 'http-error', statusCode: 400 },
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: [scaFindingSample, codeReviewFindingSample],
      advisoriesById: advisoriesByIdSample,
      client,
    })

    // check the calls and the summarized findings
    expect(summarizeFindingsResult.failedModelCallCount).toBe(1)
    expect(
      summarizeFindingsResult.findings.map((finding) => finding.summarySource),
    ).toEqual(['template', 'template'])
  })

  test('holds 7 findings at a cap of 5 to 2 calls and sums their cost', async () => {
    // one reply that grounds all 7 findings, repeated for each call
    const scaFindings = Array.from({ length: 7 }, (_, index) =>
      createScaFinding(index),
    )
    const textsByFindingId = Object.fromEntries(
      scaFindings.map((finding) => [finding.id, groundedScaText]),
    )
    // answer with the canned replies
    const { fakeLlmProvider, client } = createTestClient([
      summariesReply(textsByFindingId),
    ])

    // summarize the findings
    const summarizeFindingsResult = await summarizeFindings({
      findings: scaFindings,
      advisoriesById: advisoriesByIdSample,
      client,
      maxFindingsPerCall: 5,
    })

    // two calls, neither over the cap
    const findingCountsPerCall = fakeLlmProvider.requests.map(
      (providerRequest) => providerRequest.user.split('## Finding ').length - 1,
    )
    expect(findingCountsPerCall).toEqual([5, 2])
    expect(summarizeFindingsResult.modelCallCount).toBe(2)
    expect(summarizeFindingsResult.costUsd).toBeCloseTo(2 * costPerCallUsd, 10)
    expect(
      summarizeFindingsResult.findings.every(
        (finding) => finding.summarySource === 'model',
      ),
    ).toBe(true)
  })
})
