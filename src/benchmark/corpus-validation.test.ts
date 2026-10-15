// tests for the corpus validator over small corpora built in temporary directories and over the checked-in corpus
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BenchmarkCase, ExpectedFinding } from '@/shared/benchmark'
import { benchmarkCasesDirectory } from './cases'
import { validateBenchmarkCorpus } from './corpus-validation'
import {
  makeGitCase,
  makeSnapshotCase,
  makeTemporaryCorpus,
  removeTemporaryCorpus,
  snapshotFilesWithChange,
  type TemporaryCorpus,
  temporaryAdvisoryId,
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

// the label makeSnapshotCase puts on the changed line
const codeLabel: ExpectedFinding = {
  detector: 'code-review',
  cwe: 'CWE-89',
  file: 'src/server.ts',
  startLine: 2,
  endLine: 2,
}

// the inputs of writing one snapshot case whose trees differ in one line
interface WriteOneCaseOptions {
  corpus: TemporaryCorpus
  benchmarkCase: BenchmarkCase
}

// write one snapshot case under its own id with the one-line change
async function writeSnapshotCase({
  corpus,
  benchmarkCase,
}: WriteOneCaseOptions): Promise<void> {
  await writeCase({
    casesDirectory: corpus.casesDirectory,
    directoryName: benchmarkCase.id,
    benchmarkCase,
    files: snapshotFilesWithChange(),
  })
}

// an sca case with one well-formed label on the temporary fixture advisory
function makeScaCase(id: string): BenchmarkCase {
  return {
    ...makeSnapshotCase({ id, split: 'dev' }),
    category: 'sca',
    expected: [
      {
        detector: 'sca',
        packageName: 'lodash',
        advisoryId: temporaryAdvisoryId,
      },
    ],
  }
}

describe('validateBenchmarkCorpus', () => {
  test('names a case whose id differs from its directory', async () => {
    // write a case whose directory name is not its id
    const corpus = await makeCorpus()
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'code-01-directory-name',
      benchmarkCase: makeSnapshotCase({ id: 'code-01-other-id', split: 'dev' }),
      files: snapshotFilesWithChange(),
    })

    // the problem names both the id and the directory
    const corpusValidation = await validateBenchmarkCorpus(corpus)
    const idProblem = corpusValidation.problems.find((problem) =>
      problem.message.includes('does not match the directory name'),
    )
    expect(idProblem?.caseId).toBe('code-01-other-id')
    expect(idProblem?.message).toContain('code-01-directory-name')
  })

  test('names a snapshot case with identical base and head', async () => {
    // write a snapshot case whose head equals its base
    const corpus = await makeCorpus()
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'code-01-same',
      benchmarkCase: makeSnapshotCase({ id: 'code-01-same', split: 'dev' }),
      files: {
        'base/src/server.ts':
          '// the fixture server\nexport const port = 3000\n',
        'head/src/server.ts':
          '// the fixture server\nexport const port = 3000\n',
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'code-01-same',
      message: 'base/ and head/ hold the same files with the same contents',
    })
  })

  test('names a code case that is marked clean', async () => {
    // write a code case with isClean true and no expected findings
    const corpus = await makeCorpus()
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...makeSnapshotCase({ id: 'code-01-clean', split: 'dev' }),
        isClean: true,
        expected: [],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'code-01-clean',
      message: 'code case must expect exactly one finding but expects 0',
    })
  })

  test('names a code label outside the lines the head adds', async () => {
    // label the unchanged first line of the changed file
    const corpus = await makeCorpus()
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...makeSnapshotCase({ id: 'code-01-off', split: 'dev' }),
        expected: [{ ...codeLabel, startLine: 1, endLine: 2 }],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'code-01-off',
      message:
        'expected finding 0 labels src/server.ts lines 1-2 but the head does not add line 1',
    })
  })

  test('names a label on a file the head does not change', async () => {
    // label a file both trees hold unchanged
    const corpus = await makeCorpus()
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'code-01-file',
      benchmarkCase: {
        ...makeSnapshotCase({ id: 'code-01-file', split: 'dev' }),
        expected: [{ ...codeLabel, file: 'src/users.ts' }],
      },
      files: {
        ...snapshotFilesWithChange(),
        'base/src/users.ts': 'export const users = []\n',
        'head/src/users.ts': 'export const users = []\n',
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'code-01-file',
      message:
        'expected finding 0 labels src/users.ts but the head does not change that file',
    })
  })

  test('names an sca label with no advisory id and one with the wrong detector', async () => {
    // one sca case missing the advisory id, one expecting a code-review finding
    const corpus = await makeCorpus()
    const missingIdCase = makeScaCase('sca-01-missing')
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...missingIdCase,
        expected: [{ detector: 'sca', packageName: 'lodash' }],
      },
    })
    const wrongDetectorCase = makeScaCase('sca-02-detector')
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...wrongDetectorCase,
        expected: [
          {
            detector: 'code-review',
            packageName: 'lodash',
            advisoryId: temporaryAdvisoryId,
          },
        ],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'sca-01-missing',
      message: 'expected finding 0 has no advisoryId',
    })
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'sca-02-detector',
      message: 'sca case expects a code-review finding but must expect sca',
    })
  })

  test('names an sca label whose advisory id is not in the fixture and accepts an alias', async () => {
    // one label on an unknown id, one on the alias of the fixture advisory
    const corpus = await makeCorpus()
    const unknownIdCase = makeScaCase('sca-01-unknown')
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...unknownIdCase,
        expected: [
          {
            detector: 'sca',
            packageName: 'lodash',
            advisoryId: 'ghsa-not-here',
          },
        ],
      },
    })
    const aliasCase = makeScaCase('sca-02-alias')
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...aliasCase,
        expected: [
          {
            detector: 'sca',
            packageName: 'lodash',
            advisoryId: 'CVE-2000-0001',
          },
        ],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'sca-01-unknown',
      message: 'advisory ghsa-not-here is not in the advisory fixture',
    })
    const aliasProblems = corpusValidation.problems.filter(
      (problem) => problem.caseId === 'sca-02-alias',
    )
    expect(aliasProblems).toEqual([])
  })

  test('names a secrets label with no start line', async () => {
    // a secrets case whose label names only the file
    const corpus = await makeCorpus()
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...makeSnapshotCase({ id: 'secrets-01-line', split: 'dev' }),
        category: 'secrets',
        expected: [{ detector: 'secrets', file: 'src/server.ts' }],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'secrets-01-line',
      message: 'expected finding 0 has no startLine',
    })
  })

  test('names a real-world label without a file and line range', async () => {
    // a real-world case whose label carries only the advisory id and cwe
    const corpus = await makeCorpus()
    const gitCase = makeGitCase({ id: 'real-world-01-bare', split: 'dev' })
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'real-world-01-bare',
      benchmarkCase: {
        ...gitCase,
        expected: [
          {
            detector: 'code-review',
            advisoryId: temporaryAdvisoryId,
            cwe: 'CWE-1321',
          },
        ],
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    for (const fieldName of ['file', 'startLine', 'endLine']) {
      expect(corpusValidation.problems).toContainEqual({
        caseId: 'real-world-01-bare',
        message: `expected finding 0 has no ${fieldName}`,
      })
    }
  })

  test('names a git case with a base directory', async () => {
    // write a git case that also holds a base/ tree
    const corpus = await makeCorpus()
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'real-world-01-git',
      benchmarkCase: makeGitCase({ id: 'real-world-01-git', split: 'dev' }),
      files: { 'base/src/server.ts': '// stray base tree\n' },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'real-world-01-git',
      message: 'git case must not hold a base/ directory',
    })
  })

  test('names a real-world advisory whose references do not name the base sha', async () => {
    // a git case whose base sha is not the fix commit the advisory references
    const corpus = await makeCorpus()
    const otherSha = 'ffffffffffffffffffffffffffffffffffffffff'
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'real-world-01-sha',
      benchmarkCase: {
        ...makeGitCase({ id: 'real-world-01-sha', split: 'dev' }),
        source: {
          kind: 'git',
          repoUrl: 'https://example.invalid/lodash/lodash.git',
          baseSha: otherSha,
          headSha: 'fedcba9876543210fedcba9876543210fedcba98',
        },
      },
    })

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'real-world-01-sha',
      message: `advisory ${temporaryAdvisoryId} has no reference whose url names the base sha ${otherSha}`,
    })
  })

  test('accepts well-formed cases and reports the counts by category and split', async () => {
    // write one well-formed case of each kind
    const corpus = await makeCorpus()
    await writeSnapshotCase({
      corpus,
      benchmarkCase: makeSnapshotCase({ id: 'code-01-first', split: 'dev' }),
    })
    await writeSnapshotCase({ corpus, benchmarkCase: makeScaCase('sca-01-ok') })
    await writeSnapshotCase({
      corpus,
      benchmarkCase: {
        ...makeSnapshotCase({ id: 'secrets-01-ok', split: 'dev' }),
        category: 'secrets',
        expected: [
          { detector: 'secrets', file: 'src/server.ts', startLine: 2 },
        ],
      },
    })
    await writeCase({
      casesDirectory: corpus.casesDirectory,
      directoryName: 'real-world-01-git',
      benchmarkCase: makeGitCase({ id: 'real-world-01-git', split: 'test' }),
    })

    // only the corpus-wide count checks fail on a four-case corpus
    const corpusValidation = await validateBenchmarkCorpus(corpus)
    const caseProblems = corpusValidation.problems.filter(
      (problem) => problem.caseId !== 'corpus',
    )
    expect(caseProblems).toEqual([])
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'corpus',
      message: 'expected 12 sca cases but found 1',
    })
    expect(corpusValidation.countsByCategory).toEqual({
      sca: 1,
      code: 1,
      secrets: 1,
      clean: 0,
      'real-world': 1,
    })
    expect(corpusValidation.countsBySplit.code).toEqual({ dev: 1, test: 0 })
    expect(corpusValidation.countsBySplit['real-world']).toEqual({
      dev: 0,
      test: 1,
    })
  })

  test('names a fixture package without advisory coverage and a lockfile disagreement', async () => {
    // write a fixture app whose npm lockfile names an extra package nothing covers
    const corpus = await makeCorpus()
    await writeFile(
      join(corpus.fixtureAppDirectory, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'fixture-app' },
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/leftpad': { version: '0.0.1' },
        },
      }),
    )

    const corpusValidation = await validateBenchmarkCorpus(corpus)
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'fixture-app',
      message: 'package-lock.json names leftpad@0.0.1 but bun.lock does not',
    })
    expect(corpusValidation.problems).toContainEqual({
      caseId: 'fixture-app',
      message:
        'package leftpad has no advisory in the fixture and is not listed in known-clean.json',
    })
  })

  test.skipIf(countCheckedInCases() === 0)(
    'validates the checked-in corpus with zero problems',
    async () => {
      const corpusValidation = await validateBenchmarkCorpus()
      expect(corpusValidation.problems).toEqual([])
    },
  )
})

// count the case directories checked in under benchmark/cases, zero when the directory is absent
function countCheckedInCases(): number {
  if (!existsSync(benchmarkCasesDirectory)) {
    return 0
  }
  const entries = readdirSync(benchmarkCasesDirectory, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).length
}
