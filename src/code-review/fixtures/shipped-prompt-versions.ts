// loads every shipped code review prompt version for the tests that check each one
import { join } from 'node:path'
import { defaultPromptsDirectory, loadPrompt } from '@/prompts/prompt-loader'
import type { PromptTemplate } from '@/shared/llm'
import { codeReviewPromptId } from '../review-prompt'

// one shipped prompt version. the loaded template goes with the raw text of its file
export interface ShippedPromptVersion {
  template: PromptTemplate
  fileText: string
}

// the directory that holds the code review prompt files
const codeReviewPromptDirectory = join(
  defaultPromptsDirectory,
  codeReviewPromptId,
)

/**
 * Loads every `v<N>.md` file of the code review prompt in ascending version order.
 */
export async function loadShippedPromptVersions(): Promise<
  ShippedPromptVersion[]
> {
  // list the version numbers of the prompt files in ascending order
  const promptFileNames = await Array.fromAsync(
    new Bun.Glob('v*.md').scan(codeReviewPromptDirectory),
  )
  const promptVersions = promptFileNames.map((promptFileName) =>
    Number(promptFileName.slice(1, -'.md'.length)),
  )
  const sortedPromptVersions = promptVersions.sort(
    (first, second) => first - second,
  )

  // load each version and read the raw text of its file
  return Promise.all(sortedPromptVersions.map(loadShippedPromptVersion))
}

// load one version through the prompt loader and read its file
async function loadShippedPromptVersion(
  promptVersion: number,
): Promise<ShippedPromptVersion> {
  const template = await loadPrompt({
    id: codeReviewPromptId,
    version: promptVersion,
  })
  const fileText = await Bun.file(
    join(codeReviewPromptDirectory, `v${promptVersion}.md`),
  ).text()
  return { template, fileText }
}
