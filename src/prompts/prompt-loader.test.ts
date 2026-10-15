// tests for prompt loading: version selection, missing prompts, mismatch errors and the file hash
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { loadPrompt } from './prompt-loader'

// the prompt fixtures at the repository root
const fixturePromptsDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'prompts',
)

describe('loadPrompt', () => {
  test('loads an explicit version', async () => {
    const greetingTemplate = await loadPrompt({
      id: 'greeting',
      version: 1,
      promptsDirectory: fixturePromptsDirectory,
    })

    expect(greetingTemplate).toMatchObject({
      id: 'greeting',
      version: '1',
      text: 'Hello {{name}}.',
      variables: ['name'],
    })
  })

  test('loads the highest version when none is given', async () => {
    const greetingTemplate = await loadPrompt({
      id: 'greeting',
      promptsDirectory: fixturePromptsDirectory,
    })

    expect(greetingTemplate.version).toBe('2')
    expect(greetingTemplate.variables).toEqual(['name', 'place'])
  })

  test('hashes the whole file with sha256', async () => {
    // hash the fixture bytes directly
    const greetingFilePath = join(fixturePromptsDirectory, 'greeting', 'v2.md')
    const greetingFileBytes = await Bun.file(greetingFilePath).bytes()
    const expectedHash = createHash('sha256')
      .update(greetingFileBytes)
      .digest('hex')

    // load the same file through the loader
    const greetingTemplate = await loadPrompt({
      id: 'greeting',
      version: 2,
      promptsDirectory: fixturePromptsDirectory,
    })

    expect(greetingTemplate.hash).toBe(expectedHash)
  })

  test('throws for a missing version', async () => {
    const loadPromise = loadPrompt({
      id: 'greeting',
      version: 9,
      promptsDirectory: fixturePromptsDirectory,
    })

    await expect(loadPromise).rejects.toThrow('prompt greeting v9 not found')
  })

  test('throws for a prompt with no versions', async () => {
    const loadPromise = loadPrompt({
      id: 'does-not-exist',
      promptsDirectory: fixturePromptsDirectory,
    })

    await expect(loadPromise).rejects.toThrow(
      'prompt does-not-exist has no versions',
    )
  })

  test('throws when the frontmatter id differs from the directory', async () => {
    const loadPromise = loadPrompt({
      id: 'mismatched-id',
      promptsDirectory: fixturePromptsDirectory,
    })

    await expect(loadPromise).rejects.toThrow(
      'declares id some-other-prompt but lives under mismatched-id',
    )
  })

  test('throws when the body uses an undeclared placeholder', async () => {
    const loadPromise = loadPrompt({
      id: 'undeclared-placeholder',
      promptsDirectory: fixturePromptsDirectory,
    })

    await expect(loadPromise).rejects.toThrow(
      'uses placeholders [name, token] but declares variables [name]',
    )
  })
})
