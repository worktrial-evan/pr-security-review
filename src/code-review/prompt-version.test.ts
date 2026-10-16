// tests that the reviewer loads the prompt version it is given and the highest version without one
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultPromptsDirectory } from '@/prompts/prompt-loader'
import { sqlInjectionChangedFile } from './fixtures/changed-files'
import { emptyOutputReply, runReview } from './fixtures/review-harness'

// a prompts directory holding v1 and a v2 copy of the code-review prompt
let promptsDirectory: string

beforeEach(async () => {
  // copy v1 and write v2 as v1 with its version raised and one marker line added
  promptsDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-prompts-'),
  )
  const promptText = await Bun.file(
    join(defaultPromptsDirectory, 'code-review', 'v1.md'),
  ).text()
  await Bun.write(join(promptsDirectory, 'code-review', 'v1.md'), promptText)
  const secondPromptText = promptText
    .replace('version: 1', 'version: 2')
    .replace('# Role', 'version two marker\n\n# Role')
  await Bun.write(
    join(promptsDirectory, 'code-review', 'v2.md'),
    secondPromptText,
  )
})

afterEach(async () => {
  await rm(promptsDirectory, { recursive: true, force: true })
})

describe('reviewCode prompt version', () => {
  test('loads the version it is given', async () => {
    const reviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [emptyOutputReply],
      promptVersion: 1,
      promptsDirectory,
    })

    expect(reviewRun.codeReviewResult.promptVersion).toBe('1')
    expect(reviewRun.provider.requests[0]?.system).not.toContain(
      'version two marker',
    )
  })

  test('loads the highest version without one', async () => {
    const reviewRun = await runReview({
      changedFiles: [sqlInjectionChangedFile],
      replies: [emptyOutputReply],
      promptsDirectory,
    })

    expect(reviewRun.codeReviewResult.promptVersion).toBe('2')
    expect(reviewRun.provider.requests[0]?.system).toContain(
      'version two marker',
    )
  })
})
