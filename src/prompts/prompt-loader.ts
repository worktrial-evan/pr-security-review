// loads a versioned prompt file from prompts/<promptId>/v<N>.md and returns it as a hashed PromptTemplate
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { PromptTemplate } from '@/shared/llm'
import { findPlaceholderNames } from './prompt-renderer'

// the prompts directory at the repository root
export const defaultPromptsDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'prompts',
)

// a prompt file name: v followed by a positive integer
const promptFileNamePattern = /^v([1-9][0-9]*)\.md$/

// the frontmatter block and the body after it
const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

// the frontmatter every prompt file declares
const promptFrontmatterSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().min(1),
  variables: z.array(z.string()),
})
type PromptFrontmatter = z.infer<typeof promptFrontmatterSchema>

// which prompt to load and where. version omitted means the highest present
export interface LoadPromptOptions {
  id: string
  version?: number
  promptsDirectory?: string
}

/**
 * Loads one prompt version, or the highest version present when none is given.
 */
export async function loadPrompt({
  id,
  version,
  promptsDirectory = defaultPromptsDirectory,
}: LoadPromptOptions): Promise<PromptTemplate> {
  // pick the requested version or the highest one on disk
  const promptVersion =
    version ?? (await findHighestPromptVersion({ id, promptsDirectory }))
  const promptFilePath = join(promptsDirectory, id, `v${promptVersion}.md`)

  // read the file bytes, which the hash covers whole
  const promptFile = Bun.file(promptFilePath)
  if (!(await promptFile.exists())) {
    throw new Error(
      `prompt ${id} v${promptVersion} not found at ${promptFilePath}`,
    )
  }
  const promptFileBytes = await promptFile.bytes()
  const hash = createHash('sha256').update(promptFileBytes).digest('hex')

  // parse the frontmatter and check it against the file location and body
  const promptFileText = new TextDecoder().decode(promptFileBytes)
  const { frontmatter, body } = parsePromptFile({
    promptFileText,
    promptFilePath,
  })
  checkPromptFile({ frontmatter, body, id, promptVersion, promptFilePath })

  return {
    id,
    version: String(promptVersion),
    hash,
    text: body,
    variables: frontmatter.variables,
  }
}

// the prompt whose versions are listed
interface FindHighestPromptVersionOptions {
  id: string
  promptsDirectory: string
}

// return the highest v<N>.md version in a prompt directory
async function findHighestPromptVersion({
  id,
  promptsDirectory,
}: FindHighestPromptVersionOptions): Promise<number> {
  // list the prompt directory, treating a missing directory as empty
  const promptDirectory = join(promptsDirectory, id)
  const promptFileNames = await readdir(promptDirectory).catch(() => [])

  // keep the version numbers of files named v<N>.md
  const promptVersions: number[] = []
  for (const promptFileName of promptFileNames) {
    const promptFileNameMatch = promptFileNamePattern.exec(promptFileName)
    if (promptFileNameMatch) {
      promptVersions.push(Number(promptFileNameMatch[1]))
    }
  }

  if (promptVersions.length === 0) {
    throw new Error(`prompt ${id} has no versions in ${promptDirectory}`)
  }
  return Math.max(...promptVersions)
}

// the raw prompt file and its path for error messages
interface ParsePromptFileOptions {
  promptFileText: string
  promptFilePath: string
}

// a prompt file split into its frontmatter and body
interface ParsedPromptFile {
  frontmatter: PromptFrontmatter
  body: string
}

// split a prompt file into validated frontmatter and its trimmed body
function parsePromptFile({
  promptFileText,
  promptFilePath,
}: ParsePromptFileOptions): ParsedPromptFile {
  // find the frontmatter block
  const frontmatterMatch = frontmatterPattern.exec(promptFileText)
  if (!frontmatterMatch) {
    throw new Error(`prompt file ${promptFilePath} has no YAML frontmatter`)
  }

  // parse the YAML and validate its fields
  const frontmatterValue: unknown = Bun.YAML.parse(
    frontmatterMatch[1] as string,
  )
  const frontmatterResult = promptFrontmatterSchema.safeParse(frontmatterValue)
  if (!frontmatterResult.success) {
    throw new Error(
      `prompt file ${promptFilePath} has invalid frontmatter: ${frontmatterResult.error.message}`,
    )
  }

  return {
    frontmatter: frontmatterResult.data,
    body: (frontmatterMatch[2] as string).trim(),
  }
}

// the parsed file and the location it was loaded from
interface CheckPromptFileOptions {
  frontmatter: PromptFrontmatter
  body: string
  id: string
  promptVersion: number
  promptFilePath: string
}

// reject a file whose frontmatter disagrees with its location or its body
function checkPromptFile({
  frontmatter,
  body,
  id,
  promptVersion,
  promptFilePath,
}: CheckPromptFileOptions): void {
  // the id and version must match the directory and file name
  if (frontmatter.id !== id) {
    throw new Error(
      `prompt file ${promptFilePath} declares id ${frontmatter.id} but lives under ${id}`,
    )
  }
  if (frontmatter.version !== promptVersion) {
    throw new Error(
      `prompt file ${promptFilePath} declares version ${frontmatter.version} but is named v${promptVersion}`,
    )
  }

  // the body placeholders must equal the declared variables
  const placeholderNames = findPlaceholderNames(body).sort()
  const declaredVariableNames = [...new Set(frontmatter.variables)].sort()
  if (placeholderNames.join('\n') !== declaredVariableNames.join('\n')) {
    throw new Error(
      `prompt file ${promptFilePath} uses placeholders [${placeholderNames.join(', ')}] but declares variables [${declaredVariableNames.join(', ')}]`,
    )
  }
}
