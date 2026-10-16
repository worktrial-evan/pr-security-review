// builds the two turns of one review call: the rubric rendered with the fence description and the CWE allowlist, and the fenced chunk text
import {
  describeFence,
  fenceUntrustedContent,
  type UntrustedFence,
} from '@/prompts/fence-untrusted'
import { findPlaceholderNames, renderPrompt } from '@/prompts/prompt-renderer'
import type { PromptTemplate } from '@/shared/llm'
import { renderCweAllowlist } from './cwe-allowlist'

// the id of the review prompt under prompts/
export const codeReviewPromptId = 'code-review'

// the label of the fence around a chunk
export const codeReviewFenceLabel = 'diff'

// the two placeholders the rubric uses: the fence description and the CWE allowlist
const fenceDescriptionPlaceholderName = 'fence_description'
const cweAllowlistPlaceholderName = 'cwe_allowlist'

// the loaded rubric and the chunk text it reviews
export interface BuildReviewPromptOptions {
  template: PromptTemplate
  chunkText: string
}

// the system turn, the user turn and the fence the user turn holds
export interface ReviewPrompt {
  system: string
  user: string
  fence: UntrustedFence
}

/**
 * Builds the system and user prompts for one review chunk, with the chunk text fenced as the user turn.
 */
export function buildReviewPrompt({
  template,
  chunkText,
}: BuildReviewPromptOptions): ReviewPrompt {
  // reject a rubric that does not use both placeholders
  checkRubricPlaceholders(template)

  // fence the chunk text
  const fence = fenceUntrustedContent({
    label: codeReviewFenceLabel,
    content: chunkText,
  })

  // render the rubric with the fence description and the allowlist
  const system = renderPrompt(template, {
    [fenceDescriptionPlaceholderName]: describeFence(fence),
    [cweAllowlistPlaceholderName]: renderCweAllowlist(),
  })

  return { system, user: fence.text, fence }
}

// throw when the rubric text does not use the fence description and the allowlist placeholders, naming what is missing
function checkRubricPlaceholders(template: PromptTemplate): void {
  // list the review placeholders the rubric text leaves out
  const placeholderNames = findPlaceholderNames(template.text)
  const missingPlaceholderNames = [
    fenceDescriptionPlaceholderName,
    cweAllowlistPlaceholderName,
  ].filter((placeholderName) => !placeholderNames.includes(placeholderName))

  // reject the rubric when any is missing
  if (missingPlaceholderNames.length > 0) {
    throw new Error(
      `prompt ${template.id} v${template.version} does not use the review placeholders: ${missingPlaceholderNames.join(', ')}`,
    )
  }
}
