// fills summary and remediation on every finding: grounded model text for introduced findings, templates otherwise
import { z } from 'zod'
import { loadPrompt } from '@/prompts/prompt-loader'
import { renderPrompt } from '@/prompts/prompt-renderer'
import type { Advisory } from '@/shared/advisory'
import type { Finding, SummarySource } from '@/shared/finding'
import type { LlmClient, PromptTemplate } from '@/shared/llm'
import {
  buildSummaryPacket,
  describePacketFences,
  renderSummaryPackets,
  type SummaryPacket,
} from './summary-packet'
import {
  buildPreExistingSummary,
  buildTemplateSummary,
} from './summary-template'
import { type ModelSummary, validateSummary } from './validate'

// the prompt id and version every summary call uses
export const summarizePromptId = 'summarize'
const summarizePromptVersion = 1

// the most findings one model call holds unless the caller sets another cap
export const defaultMaxFindingsPerCall = 5

export interface SummarizeFindingsOptions {
  findings: Finding[]
  advisoriesById: ReadonlyMap<string, Advisory>
  client: LlmClient
  modelId?: string
  maxFindingsPerCall?: number
}

// the summarized findings in input order, with the record of the run that produced them
export interface SummarizeFindingsResult {
  findings: Finding[]
  promptId: string
  promptVersion: string
  groundingRejectionCount: number
  modelCallCount: number
  failedModelCallCount: number
  costUsd: number
}

// the model output: one summary and remediation per finding id
const modelSummariesSchema = z.object({
  summaries: z.array(
    z.object({
      findingId: z.string(),
      summary: z.string(),
      remediation: z.string(),
    }),
  ),
})

// the text chosen for one finding and where it came from
interface ChosenSummary {
  modelSummary: ModelSummary
  summarySource: SummarySource
}

// the counts and cost gathered across every call of one run
interface SummarizeRunTally {
  groundingRejectionCount: number
  modelCallCount: number
  failedModelCallCount: number
  costUsd: number
}

// what every call of one run shares
interface SummarizeCallContext {
  template: PromptTemplate
  client: LlmClient
  modelId: string | undefined
  runTally: SummarizeRunTally
}

/**
 * Summarizes every finding, calling the model in capped batches for introduced findings only.
 */
export async function summarizeFindings({
  findings,
  advisoriesById,
  client,
  modelId,
  maxFindingsPerCall = defaultMaxFindingsPerCall,
}: SummarizeFindingsOptions): Promise<SummarizeFindingsResult> {
  // load the prompt and build one packet per finding
  const template = await loadPrompt({
    id: summarizePromptId,
    version: summarizePromptVersion,
  })
  const packets = findings.map((finding) =>
    buildSummaryPacket({ finding, advisoriesById }),
  )

  // give pre-existing findings their one-liner, then summarize the introduced ones in batches
  const preExistingPackets = packets.filter(
    (packet) => !packet.finding.isIntroducedByPullRequest,
  )
  const introducedPackets = packets.filter(
    (packet) => packet.finding.isIntroducedByPullRequest,
  )
  const chosenSummariesByFindingId =
    choosePreExistingSummaries(preExistingPackets)
  const runTally: SummarizeRunTally = {
    groundingRejectionCount: 0,
    modelCallCount: 0,
    failedModelCallCount: 0,
    costUsd: 0,
  }
  await summarizeIntroducedPackets({
    introducedPackets,
    maxFindingsPerCall,
    chosenSummariesByFindingId,
    callContext: { template, client, modelId, runTally },
  })

  // write the chosen text onto each finding in input order
  const summarizedFindings = findings.map((finding) =>
    applyChosenSummary(finding, chosenSummariesByFindingId),
  )
  return {
    findings: summarizedFindings,
    promptId: template.id,
    promptVersion: template.version,
    ...runTally,
  }
}

// give each pre-existing finding its one-liner and template remediation
function choosePreExistingSummaries(
  preExistingPackets: SummaryPacket[],
): Map<string, ChosenSummary> {
  // build the one-liner for each finding
  const chosenSummariesByFindingId = new Map<string, ChosenSummary>()
  for (const packet of preExistingPackets) {
    chosenSummariesByFindingId.set(packet.finding.id, {
      modelSummary: buildPreExistingSummary(packet),
      summarySource: 'template',
    })
  }
  return chosenSummariesByFindingId
}

// the introduced packets, the cap, the map that collects chosen text and the shared call context
interface SummarizeIntroducedPacketsOptions {
  introducedPackets: SummaryPacket[]
  maxFindingsPerCall: number
  chosenSummariesByFindingId: Map<string, ChosenSummary>
  callContext: SummarizeCallContext
}

// summarize the introduced packets one capped batch at a time
async function summarizeIntroducedPackets({
  introducedPackets,
  maxFindingsPerCall,
  chosenSummariesByFindingId,
  callContext,
}: SummarizeIntroducedPacketsOptions): Promise<void> {
  // run the batches in order and collect their chosen text
  const batches = splitIntoBatches(introducedPackets, maxFindingsPerCall)
  for (const batchPackets of batches) {
    const batchSummaries = await summarizeBatch({ batchPackets, callContext })
    for (const [findingId, chosenSummary] of batchSummaries) {
      chosenSummariesByFindingId.set(findingId, chosenSummary)
    }
  }
}

// split packets into consecutive batches of at most the cap
function splitIntoBatches(
  packets: SummaryPacket[],
  maxFindingsPerCall: number,
): SummaryPacket[][] {
  // hold every batch to at least one finding
  const batchSize = Math.max(1, Math.floor(maxFindingsPerCall))
  const batches: SummaryPacket[][] = []
  for (let i = 0; i < packets.length; i += batchSize) {
    batches.push(packets.slice(i, i + batchSize))
  }
  return batches
}

// one batch of packets and the shared call context
interface SummarizeBatchOptions {
  batchPackets: SummaryPacket[]
  callContext: SummarizeCallContext
}

// summarize one batch: validate each finding, retry the rejected ones once together, then fall back to templates
async function summarizeBatch({
  batchPackets,
  callContext,
}: SummarizeBatchOptions): Promise<Map<string, ChosenSummary>> {
  // ask for every finding in the batch
  const chosenSummaries = new Map<string, ChosenSummary>()
  const firstModelSummaries = await requestModelSummaries({
    requestPackets: batchPackets,
    violationsByFindingId: new Map(),
    callContext,
  })

  // keep the grounded summaries and collect the violations of the rest
  const violationsByFindingId = acceptGroundedSummaries({
    requestPackets: batchPackets,
    modelSummaries: firstModelSummaries,
    chosenSummaries,
    callContext,
  })
  if (violationsByFindingId.size === 0) {
    return chosenSummaries
  }

  // ask once more for the rejected findings, with their violations appended
  const retryPackets = batchPackets.filter((packet) =>
    violationsByFindingId.has(packet.finding.id),
  )
  const retryModelSummaries = await requestModelSummaries({
    requestPackets: retryPackets,
    violationsByFindingId,
    callContext,
  })
  const retryViolationsByFindingId = acceptGroundedSummaries({
    requestPackets: retryPackets,
    modelSummaries: retryModelSummaries,
    chosenSummaries,
    callContext,
  })

  // fall back to the template for every finding rejected twice
  for (const packet of retryPackets) {
    if (retryViolationsByFindingId.has(packet.finding.id)) {
      chosenSummaries.set(packet.finding.id, {
        modelSummary: buildTemplateSummary(packet),
        summarySource: 'template',
      })
    }
  }
  return chosenSummaries
}

// the packets of one call, the violations to append and the shared call context
interface RequestModelSummariesOptions {
  requestPackets: SummaryPacket[]
  violationsByFindingId: ReadonlyMap<string, string[]>
  callContext: SummarizeCallContext
}

// make one model call for the packets and return its summaries by finding id, or undefined when the call fails
async function requestModelSummaries({
  requestPackets,
  violationsByFindingId,
  callContext,
}: RequestModelSummariesOptions): Promise<
  Map<string, ModelSummary> | undefined
> {
  // put the fence descriptions in the system prompt and the packets in the user text
  const { template, client, modelId, runTally } = callContext
  const system = renderPrompt(template, {
    fenceDescriptions: describePacketFences(requestPackets),
  })
  const user = renderSummaryPackets({
    packets: requestPackets,
    violationsByFindingId,
  })

  // call the model. the llm client audits a failed call with its error
  runTally.modelCallCount += 1
  try {
    const generateResult = await client.generate({
      promptId: template.id,
      promptVersion: template.version,
      promptHash: template.hash,
      system,
      user,
      schema: modelSummariesSchema,
      modelId,
    })
    runTally.costUsd += generateResult.costUsd ?? 0
    return indexModelSummaries(generateResult.output)
  } catch {
    runTally.failedModelCallCount += 1
    return undefined
  }
}

// key the model summaries by finding id, keeping the first entry for an id
function indexModelSummaries(
  modelSummaries: z.infer<typeof modelSummariesSchema>,
): Map<string, ModelSummary> {
  // skip a repeated finding id
  const modelSummariesByFindingId = new Map<string, ModelSummary>()
  for (const { findingId, summary, remediation } of modelSummaries.summaries) {
    if (!modelSummariesByFindingId.has(findingId)) {
      modelSummariesByFindingId.set(findingId, { summary, remediation })
    }
  }
  return modelSummariesByFindingId
}

// the packets of one call, its summaries, the map that collects accepted text and the shared call context
interface AcceptGroundedSummariesOptions {
  requestPackets: SummaryPacket[]
  modelSummaries: Map<string, ModelSummary> | undefined
  chosenSummaries: Map<string, ChosenSummary>
  callContext: SummarizeCallContext
}

// accept each grounded summary and return the violations of the rest. a failed call sends every packet to the template
function acceptGroundedSummaries({
  requestPackets,
  modelSummaries,
  chosenSummaries,
  callContext,
}: AcceptGroundedSummariesOptions): Map<string, string[]> {
  // give every packet its template when the call failed
  const violationsByFindingId = new Map<string, string[]>()
  if (!modelSummaries) {
    for (const packet of requestPackets) {
      chosenSummaries.set(packet.finding.id, {
        modelSummary: buildTemplateSummary(packet),
        summarySource: 'template',
      })
    }
    return violationsByFindingId
  }

  // validate each finding on its own
  for (const packet of requestPackets) {
    const modelSummary = modelSummaries.get(packet.finding.id)
    const violations = validateSummary({
      modelSummary,
      grounding: packet.grounding,
    })
    if (modelSummary && violations.length === 0) {
      chosenSummaries.set(packet.finding.id, {
        modelSummary,
        summarySource: 'model',
      })
      continue
    }

    // count the rejection and keep its violations for the retry
    callContext.runTally.groundingRejectionCount += 1
    violationsByFindingId.set(packet.finding.id, violations)
  }
  return violationsByFindingId
}

// copy a finding with its chosen summary, remediation and summary source
function applyChosenSummary(
  finding: Finding,
  chosenSummariesByFindingId: ReadonlyMap<string, ChosenSummary>,
): Finding {
  // every finding has a chosen summary once all batches have run
  const chosenSummary = chosenSummariesByFindingId.get(finding.id)
  if (!chosenSummary) {
    throw new Error(`no summary was chosen for finding ${finding.id}`)
  }
  return {
    ...finding,
    summary: chosenSummary.modelSummary.summary,
    remediation: chosenSummary.modelSummary.remediation,
    summarySource: chosenSummary.summarySource,
  }
}
