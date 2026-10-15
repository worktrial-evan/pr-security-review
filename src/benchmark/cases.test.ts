// tests for the case loader over small corpora built in temporary directories
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadBenchmarkCases, readCaseDirectories } from './cases'
import {
  makeSnapshotCase,
  makeTemporaryCorpus,
  removeTemporaryCorpus,
  snapshotFilesWithChange,
  type TemporaryCorpus,
  writeCase,
} from './temporary-corpus'

// the temporary corpora made during a test, removed afterwards
const temporaryCorpora: TemporaryCorpus[] = []

// remove every temporary corpus after each test
afterEach(async () => {
  for (const temporaryCorpus of temporaryCorpora) {
    await removeTemporaryCorpus(temporaryCorpus)
  }
  temporaryCorpora.length = 0
})

// make a temporary corpus the test cleans up
async function makeCorpus(): Promise<TemporaryCorpus> {
  const corpus = await makeTemporaryCorpus()
  temporaryCorpora.push(corpus)
  return corpus
}

describe('loadBenchmarkCases', () => {
  test('loads a valid two-case corpus sorted by id and filters by split', async () => {
    // write two snapshot cases in reverse id order
    const { casesDirectory } = await makeCorpus()
    await writeCase({
      casesDirectory,
      directoryName: 'code-02-second',
      benchmarkCase: makeSnapshotCase({ id: 'code-02-second', split: 'test' }),
      files: snapshotFilesWithChange(),
    })
    await writeCase({
      casesDirectory,
      directoryName: 'code-01-first',
      benchmarkCase: makeSnapshotCase({ id: 'code-01-first', split: 'dev' }),
      files: snapshotFilesWithChange(),
    })

    // every case comes back in id order with its directory
    const loadedCases = await loadBenchmarkCases({ casesDirectory })
    expect(
      loadedCases.map((loadedCase) => loadedCase.benchmarkCase.id),
    ).toEqual(['code-01-first', 'code-02-second'])
    expect(loadedCases[0]?.caseDirectory).toBe(
      join(casesDirectory, 'code-01-first'),
    )

    // the split filter keeps only that split
    const devCases = await loadBenchmarkCases({ casesDirectory, split: 'dev' })
    expect(devCases.map((loadedCase) => loadedCase.benchmarkCase.id)).toEqual([
      'code-01-first',
    ])
    const testCases = await loadBenchmarkCases({
      casesDirectory,
      split: 'test',
    })
    expect(testCases.map((loadedCase) => loadedCase.benchmarkCase.id)).toEqual([
      'code-02-second',
    ])
  })

  test('throws when a case.json does not parse', async () => {
    // write a case directory with a malformed case.json
    const { casesDirectory } = await makeCorpus()
    await mkdir(join(casesDirectory, 'code-01-broken'), { recursive: true })
    await writeFile(
      join(casesDirectory, 'code-01-broken', 'case.json'),
      '{ not json',
    )

    await expect(loadBenchmarkCases({ casesDirectory })).rejects.toThrow(
      'code-01-broken',
    )
  })

  test('loads nothing from a missing cases directory', async () => {
    const { rootDirectory } = await makeCorpus()
    const loadedCases = await loadBenchmarkCases({
      casesDirectory: join(rootDirectory, 'missing'),
    })
    expect(loadedCases).toEqual([])
  })
})

describe('readCaseDirectories', () => {
  test('reports a case.json that does not match the contract as a failed read', async () => {
    // write a case.json with a category the contract does not know
    const { casesDirectory } = await makeCorpus()
    await mkdir(join(casesDirectory, 'other-01-unknown'), { recursive: true })
    await writeFile(
      join(casesDirectory, 'other-01-unknown', 'case.json'),
      JSON.stringify({
        ...makeSnapshotCase({ id: 'other-01-unknown', split: 'dev' }),
        category: 'other',
      }),
    )

    // the read names the directory and the failing path
    const [caseRead] = await readCaseDirectories(casesDirectory)
    expect(caseRead?.kind).toBe('failed')
    if (caseRead?.kind === 'failed') {
      expect(caseRead.directoryName).toBe('other-01-unknown')
      expect(caseRead.message).toContain('category')
    }
  })
})
