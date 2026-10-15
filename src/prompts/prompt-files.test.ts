// tests that every prompt file under prompts/ loads and keeps a stable hash equal to the sha256 of its bytes
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { defaultPromptsDirectory, loadPrompt } from './prompt-loader'

// every v<N>.md file one level below the prompts directory
const promptFileGlob = new Bun.Glob('*/v*.md')
const promptFileRelativePaths = [
  ...promptFileGlob.scanSync({ cwd: defaultPromptsDirectory }),
]

test('every prompt file loads with a stable hash', async () => {
  for (const promptFileRelativePath of promptFileRelativePaths) {
    // read the id and version from the path
    const [id, promptFileName] = promptFileRelativePath.split('/') as [
      string,
      string,
    ]
    const version = Number(promptFileName.slice(1, -'.md'.length))

    // load the prompt twice
    const firstTemplate = await loadPrompt({ id, version })
    const secondTemplate = await loadPrompt({ id, version })

    // compare both hashes with the sha256 of the bytes on disk
    const promptFilePath = join(defaultPromptsDirectory, promptFileRelativePath)
    const promptFileBytes = await Bun.file(promptFilePath).bytes()
    const expectedHash = createHash('sha256')
      .update(promptFileBytes)
      .digest('hex')
    expect(firstTemplate.hash).toBe(expectedHash)
    expect(secondTemplate.hash).toBe(expectedHash)
  }
})
