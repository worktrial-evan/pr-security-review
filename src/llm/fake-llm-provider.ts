// a fake model provider that returns canned outputs or http errors keyed by prompt id, so tests need no network or key
import type { LlmUsage } from '@/shared/llm'
import {
  LlmHttpError,
  type LlmProvider,
  type LlmProviderRequest,
  type LlmProviderResponse,
} from './llm-provider'

// one canned reply: an output with optional usage, or an http error status
export type FakeLlmReply =
  | { kind: 'output'; output: unknown; usage?: LlmUsage }
  | { kind: 'http-error'; statusCode: number }

// the canned replies for each prompt id, returned in order. the last reply repeats once the list runs out
export type FakeLlmRepliesByPromptId = Record<string, FakeLlmReply[]>

// a provider that also records every request it received
export interface FakeLlmProvider extends LlmProvider {
  readonly requests: LlmProviderRequest[]
}

// the usage a canned output reports when it names none
const emptyUsage: LlmUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * Creates a fake provider that answers each prompt id with its canned replies in order.
 */
export function createFakeLlmProvider(
  repliesByPromptId: FakeLlmRepliesByPromptId,
): FakeLlmProvider {
  // the requests seen and how many replies each prompt id has used
  const requests: LlmProviderRequest[] = []
  const replyCountByPromptId = new Map<string, number>()

  // record the request and answer with the next canned reply
  async function generate(
    request: LlmProviderRequest,
  ): Promise<LlmProviderResponse> {
    requests.push(request)
    const fakeLlmReply = takeNextReply({
      repliesByPromptId,
      replyCountByPromptId,
      promptId: request.promptId,
    })

    // throw an http error reply, return an output reply
    if (fakeLlmReply.kind === 'http-error') {
      throw new LlmHttpError({
        statusCode: fakeLlmReply.statusCode,
        message: 'fake provider error',
      })
    }
    return {
      rawOutput: structuredClone(fakeLlmReply.output),
      usage: fakeLlmReply.usage ?? emptyUsage,
    }
  }

  return { requests, generate }
}

// the canned replies and the position reached for each prompt id
interface TakeNextReplyOptions {
  repliesByPromptId: FakeLlmRepliesByPromptId
  replyCountByPromptId: Map<string, number>
  promptId: string
}

// return the next reply for a prompt id, repeating the last one
function takeNextReply({
  repliesByPromptId,
  replyCountByPromptId,
  promptId,
}: TakeNextReplyOptions): FakeLlmReply {
  // reject a prompt id with no canned replies
  const fakeLlmReplies = repliesByPromptId[promptId]
  if (!fakeLlmReplies || fakeLlmReplies.length === 0) {
    throw new Error(`fake llm provider has no reply for prompt ${promptId}`)
  }

  // advance the position, holding at the last reply
  const replyCount = replyCountByPromptId.get(promptId) ?? 0
  replyCountByPromptId.set(promptId, replyCount + 1)
  const replyIndex = Math.min(replyCount, fakeLlmReplies.length - 1)
  return fakeLlmReplies[replyIndex] as FakeLlmReply
}
