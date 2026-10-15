// tests for the benchmark:validate command over a broken temporary corpus and the checked-in one
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { benchmarkCasesDirectory } from './cases'
import {
  makeSnapshotCase,
  makeTemporaryCorpus,
  removeTemporaryCorpus,
  snapshotFilesWithChange,
  type TemporaryCorpus,
  writeCase,
} from './temporary-corpus'
import { runValidateCommand } from './validate'

// the lines the command printed on stdout and stderr during a test
let printedLines: string[]
let errorLines: string[]

// the console spies, restored after each test
let logSpy: ReturnType<typeof spyOn>
let errorSpy: ReturnType<typeof spyOn>

// the temporary corpus of a test, if it made one
let temporaryCorpus: TemporaryCorpus | undefined

beforeEach(() => {
  // capture everything the command prints
  printedLines = []
  errorLines = []
  logSpy = spyOn(console, 'log').mockImplementation((line: string) => {
    printedLines.push(line)
  })
  errorSpy = spyOn(console, 'error').mockImplementation((line: string) => {
    errorLines.push(line)
  })
})

afterEach(async () => {
  // put the console back and remove the corpus
  logSpy.mockRestore()
  errorSpy.mockRestore()
  if (temporaryCorpus !== undefined) {
    await removeTemporaryCorpus(temporaryCorpus)
    temporaryCorpus = undefined
  }
})

describe('runValidateCommand', () => {
  test('returns 1 and names the broken case on stderr', async () => {
    // a corpus with one case whose id differs from its directory
    temporaryCorpus = await makeTemporaryCorpus()
    await writeCase({
      casesDirectory: temporaryCorpus.casesDirectory,
      directoryName: 'code-99-wrong-directory',
      benchmarkCase: makeSnapshotCase({ id: 'code-01-sql', split: 'dev' }),
      files: snapshotFilesWithChange(),
    })

    // the exit status is 1, the counts are printed and the problem names the case
    const exitStatus = await runValidateCommand(temporaryCorpus)
    expect(exitStatus).toBe(1)
    expect(printedLines).toContain('code: 1 (dev 1, test 0)')
    expect(printedLines).toContain('total: 1')
    expect(errorLines).toContain(
      'code-01-sql: id "code-01-sql" does not match the directory name "code-99-wrong-directory"',
    )
  })

  test.skipIf(!existsSync(benchmarkCasesDirectory))(
    'returns 0 and prints the counts of the checked-in corpus',
    async () => {
      const exitStatus = await runValidateCommand()
      expect(exitStatus).toBe(0)
      expect(errorLines).toEqual([])
      expect(printedLines).toContain('sca: 12 (dev 8, test 4)')
      expect(printedLines).toContain('total: 54')
    },
  )
})
