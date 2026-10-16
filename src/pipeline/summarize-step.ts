// the summarize step. it writes grounded model summaries when the llm is on and template summaries when it is off

import type { Advisory, AdvisoryStore } from '@/shared/advisory'
import type { Finding } from '@/shared/finding'
import type { LlmClient } from '@/shared/llm'
import { summarizeFindings } from '@/summarize/summarize-findings'
import { buildSummaryPacket } from '@/summarize/summary-packet'
import {
  buildPreExistingSummary,
  buildTemplateSummary,
} from '@/summarize/summary-template'

// the summarized findings and what the run records about the summaries
export interface SummarizeStepOutput {
  findings: Finding[]
  promptId: string | undefined
  promptVersion: string | undefined
  groundingRejectionCount: number
  failedModelCallCount: number
}

// the findings and the store their advisories come from. the model client is undefined when the llm is off
export interface SummarizeReviewFindingsOptions {
  findings: Finding[]
  advisoryStore: AdvisoryStore | undefined
  summarizeLlmClient: LlmClient | undefined
  summarizeModelId: string
}

/**
 * Fills the summary and remediation of every finding, with the model when there is a client and from templates otherwise.
 */
export async function summarizeReviewFindings({
  findings,
  advisoryStore,
  summarizeLlmClient,
  summarizeModelId,
}: SummarizeReviewFindingsOptions): Promise<SummarizeStepOutput> {
  // gather the advisory of every dependency finding
  const advisoriesById = await collectAdvisoriesById({
    findings,
    advisoryStore,
  })

  // fill every finding from templates without a model
  if (summarizeLlmClient === undefined) {
    return {
      findings: summarizeWithTemplates({ findings, advisoriesById }),
      promptId: undefined,
      promptVersion: undefined,
      groundingRejectionCount: 0,
      failedModelCallCount: 0,
    }
  }

  // ask the model and keep what the grounding check accepts
  const summarizeFindingsResult = await summarizeFindings({
    findings,
    advisoriesById,
    client: summarizeLlmClient,
    modelId: summarizeModelId,
  })
  return {
    findings: summarizeFindingsResult.findings,
    promptId: summarizeFindingsResult.promptId,
    promptVersion: summarizeFindingsResult.promptVersion,
    groundingRejectionCount: summarizeFindingsResult.groundingRejectionCount,
    failedModelCallCount: summarizeFindingsResult.failedModelCallCount,
  }
}

// the findings and the store to look their advisories up in
interface CollectAdvisoriesByIdOptions {
  findings: Finding[]
  advisoryStore: AdvisoryStore | undefined
}

// look up each dependency finding's advisory by id or alias and key it by the finding's advisory id
async function collectAdvisoriesById({
  findings,
  advisoryStore,
}: CollectAdvisoriesByIdOptions): Promise<Map<string, Advisory>> {
  const advisoriesById = new Map<string, Advisory>()
  if (advisoryStore === undefined) {
    return advisoriesById
  }

  // find the advisory that names the finding's id among its package's advisories
  for (const finding of findings) {
    if (
      finding.detector !== 'dependency' ||
      advisoriesById.has(finding.advisoryId)
    ) {
      continue
    }
    const packageAdvisories = await advisoryStore.getByPackage(
      finding.packageName,
    )
    const matchingAdvisory = packageAdvisories.find(
      (advisory) =>
        advisory.id === finding.advisoryId ||
        advisory.aliases.includes(finding.advisoryId),
    )
    if (matchingAdvisory !== undefined) {
      advisoriesById.set(finding.advisoryId, matchingAdvisory)
    }
  }
  return advisoriesById
}

// the findings and their advisories
interface SummarizeWithTemplatesOptions {
  findings: Finding[]
  advisoriesById: ReadonlyMap<string, Advisory>
}

// fill each finding with the template summary. a pre-existing finding gets the one-liner
function summarizeWithTemplates({
  findings,
  advisoriesById,
}: SummarizeWithTemplatesOptions): Finding[] {
  return findings.map((finding) => {
    const summaryPacket = buildSummaryPacket({ finding, advisoriesById })
    const modelSummary = finding.isIntroducedByPullRequest
      ? buildTemplateSummary(summaryPacket)
      : buildPreExistingSummary(summaryPacket)
    return {
      ...finding,
      summary: modelSummary.summary,
      remediation: modelSummary.remediation,
      summarySource: 'template',
    }
  })
}
