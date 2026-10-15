// builds the temporary corpora the loader, validator and validate command tests read: a cases directory, a one-package fixture app and an advisory fixture covering it
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { BenchmarkCase, BenchmarkSplit } from '@/shared/benchmark'

// a fake sha the fixture advisory's fix reference names. not a real commit
export const fakeFixSha = '0123456789abcdef0123456789abcdef01234567'

// the advisory id the temporary fixture holds
export const temporaryAdvisoryId = 'PRR-TEST-1'

// the directories of one temporary corpus, in the shape validateBenchmarkCorpus takes, plus the root that holds them
export interface TemporaryCorpus {
  rootDirectory: string
  casesDirectory: string
  advisoryFixtureDirectory: string
  fixtureAppDirectory: string
}

// the files of one case directory, keyed by path relative to the case directory
export type CaseFiles = Record<string, string>

// the inputs of writing one case directory
export interface WriteCaseOptions {
  casesDirectory: string
  directoryName: string
  benchmarkCase: BenchmarkCase
  files?: CaseFiles
}

// the id and split of a case the test makes
export interface MakeCaseOptions {
  id: string
  split: BenchmarkSplit
}

/**
 * Makes a temporary corpus with an empty cases directory and a one-package fixture app with full advisory coverage.
 */
export async function makeTemporaryCorpus(): Promise<TemporaryCorpus> {
  // make the three directories under one root
  const rootDirectory = await mkdtemp(join(tmpdir(), 'benchmark-corpus-test-'))
  const corpus: TemporaryCorpus = {
    rootDirectory,
    casesDirectory: join(rootDirectory, 'cases'),
    advisoryFixtureDirectory: join(rootDirectory, 'advisories'),
    fixtureAppDirectory: join(rootDirectory, 'app'),
  }
  await mkdir(corpus.casesDirectory, { recursive: true })
  await mkdir(corpus.advisoryFixtureDirectory, { recursive: true })
  await mkdir(corpus.fixtureAppDirectory, { recursive: true })

  // write the two lockfiles that agree on lodash
  await writeFile(
    join(corpus.fixtureAppDirectory, 'bun.lock'),
    `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "fixture-app", "dependencies": { "lodash": "4.17.21" } },
  },
  "packages": {
    "lodash": ["lodash@4.17.21", "", {}, "sha512-notarealintegrityvalue"],
  }
}
`,
  )
  await writeFile(
    join(corpus.fixtureAppDirectory, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture-app' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    }),
  )

  // write one advisory covering lodash with a fix reference naming the fake sha
  await writeFile(
    join(corpus.advisoryFixtureDirectory, 'advisories.json'),
    JSON.stringify([
      {
        id: temporaryAdvisoryId,
        aliases: ['CVE-2000-0001'],
        summary: 'made-up advisory for the corpus tests',
        details: 'affects lodash below 4.17.21',
        affected: [
          {
            ecosystem: 'npm',
            name: 'lodash',
            ranges: [
              {
                type: 'SEMVER',
                events: [{ introduced: '0' }, { fixed: '4.17.21' }],
              },
            ],
            versions: [],
          },
        ],
        references: [
          {
            type: 'FIX',
            url: `https://example.invalid/lodash/commit/${fakeFixSha}`,
          },
        ],
        published: '2024-01-01T00:00:00Z',
        modified: '2024-01-01T00:00:00Z',
        isGithubReviewed: true,
      },
    ]),
  )
  await writeFile(
    join(corpus.advisoryFixtureDirectory, 'known-clean.json'),
    JSON.stringify({ packages: [] }),
  )

  return corpus
}

/**
 * Removes a temporary corpus and everything under it.
 */
export async function removeTemporaryCorpus({
  rootDirectory,
}: TemporaryCorpus): Promise<void> {
  await rm(rootDirectory, { recursive: true, force: true })
}

/**
 * Writes one case directory with its case.json and any extra files.
 */
export async function writeCase({
  casesDirectory,
  directoryName,
  benchmarkCase,
  files = {},
}: WriteCaseOptions): Promise<void> {
  // write the case.json
  const caseDirectory = join(casesDirectory, directoryName)
  await mkdir(caseDirectory, { recursive: true })
  await writeFile(
    join(caseDirectory, 'case.json'),
    JSON.stringify(benchmarkCase, null, 2),
  )

  // write every extra file under the case directory
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(caseDirectory, relativePath)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, contents)
  }
}

/**
 * Makes a code case with one labeled finding on the line snapshotFilesWithChange changes and the snapshot source the validator expects.
 */
export function makeSnapshotCase({
  id,
  split,
}: MakeCaseOptions): BenchmarkCase {
  return {
    id,
    split,
    category: 'code',
    isClean: false,
    description: 'a made-up code case',
    source: { kind: 'snapshot', dir: `benchmark/cases/${id}` },
    expected: [
      {
        detector: 'code-review',
        cwe: 'CWE-89',
        file: 'src/server.ts',
        startLine: 2,
        endLine: 2,
      },
    ],
  }
}

/**
 * Makes a real-world git case whose advisory is in the temporary fixture and names the base sha.
 */
export function makeGitCase({ id, split }: MakeCaseOptions): BenchmarkCase {
  return {
    id,
    split,
    category: 'real-world',
    isClean: false,
    description: 'a made-up real-world case',
    source: {
      kind: 'git',
      repoUrl: 'https://example.invalid/lodash/lodash.git',
      baseSha: fakeFixSha,
      headSha: 'fedcba9876543210fedcba9876543210fedcba98',
    },
    expected: [
      {
        detector: 'code-review',
        advisoryId: temporaryAdvisoryId,
        cwe: 'CWE-1321',
        file: 'lodash.js',
        startLine: 10,
        endLine: 12,
      },
    ],
  }
}

/**
 * Returns a base and head tree that differ in the second line of src/server.ts.
 */
export function snapshotFilesWithChange(): CaseFiles {
  return {
    'base/src/server.ts': '// the fixture server\nexport const port = 3000\n',
    'head/src/server.ts':
      '// the fixture server\nexport const query = "select * from users where id = " + userId\n',
  }
}
