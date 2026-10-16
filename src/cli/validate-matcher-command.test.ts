// tests the validate-matcher command. the script's output and exit status pass through
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CliOutput } from './terminal-text'
import { runValidateMatcherCommand } from './validate-matcher-command'

// the directory holding the stand-in script
let scriptDirectory: string

beforeEach(async () => {
  scriptDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-validate-'),
  )
})

afterEach(async () => {
  await rm(scriptDirectory, { recursive: true, force: true })
})

describe('runValidateMatcherCommand', () => {
  test('writes the script output to each stream and returns its exit status', async () => {
    // a stand-in script that writes to both streams and exits 1
    const scriptPath = join(scriptDirectory, 'validate.ts')
    await Bun.write(
      scriptPath,
      "console.log('3 disagreements')\nconsole.error('1 not accepted')\nprocess.exit(1)\n",
    )
    let standardOutput = ''
    let standardError = ''
    const output: CliOutput = {
      writeOut: (text) => {
        standardOutput += text
      },
      writeErr: (text) => {
        standardError += text
      },
    }

    const exitCode = await runValidateMatcherCommand({ output, scriptPath })

    expect(exitCode).toBe(1)
    expect(standardOutput).toBe('3 disagreements\n')
    expect(standardError).toBe('1 not accepted\n')
  })
})
