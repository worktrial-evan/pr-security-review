// tests for the osv-scanner oracle: the recorded output parse, the parser edge cases including a package repeated across
// results, the written database archive, the result decided from stdout and stderr, and live runs over the fixture lockfiles
import { afterAll, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { unzipSync } from 'fflate'
import { readFixtureAdvisories } from './matcher-fixtures'
import {
  isOracleAvailable,
  type OsvEntry,
  oracleBinaryName,
  oracleDatabaseArchivePath,
  parseOracleOutput,
  runOracle,
  writeOracleDatabase,
} from './oracle'

// the lockfile the live run scans and the output recorded from osv-scanner 2.7.0 over it
const fixtureLockfilePath = join(
  import.meta.dir,
  'fixtures',
  'package-lock.json',
)
const recordedOutputPath = join(
  import.meta.dir,
  'fixtures',
  'osv-scanner-output.json',
)

// the stderr line osv-scanner 2.7.0 prints when the database directory holds no archive
const databaseLoadFailureLine =
  'could not load db for npm ecosystem: unable to fetch OSV database: no offline version of the OSV database is available'

// a lockfile that resolves no packages
const emptyLockfileText = JSON.stringify({
  name: 'empty-fixture',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: { '': { name: 'empty-fixture', version: '1.0.0' } },
})

// the packages the fixture lockfile resolves, in sorted order
const expectedPackages = [
  { packageName: 'alias-kit', version: '1.0.2' },
  { packageName: 'left-pad', version: '1.3.0' },
  { packageName: 'range-kit', version: '1.0.0' },
]

// the matches osv-scanner reports over the fixture lockfile: one alias group for alias-kit, two groups for range-kit, none for left-pad
const expectedMatches = [
  {
    packageName: 'alias-kit',
    version: '1.0.2',
    advisoryIds: ['CVE-2024-0001', 'GHSA-ALIA-0001'],
  },
  {
    packageName: 'range-kit',
    version: '1.0.0',
    advisoryIds: ['GHSA-RANG-0001'],
  },
  {
    packageName: 'range-kit',
    version: '1.0.0',
    advisoryIds: ['GHSA-RANG-0002'],
  },
]

// the output a stand-in osv-scanner prints and the code it exits with
interface InstallFakeOracleOptions {
  stdoutText: string
  stderrText: string
  exitCode: number
}

// every temporary directory the tests create, removed together at the end
const temporaryDirectories: string[] = []

afterAll(async () => {
  for (const temporaryDirectory of temporaryDirectories) {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

describe('parseOracleOutput', () => {
  test('Recorded output: parses the recorded output into three packages and the groups of each', async () => {
    const recordedOutput: unknown = await Bun.file(recordedOutputPath).json()
    const oracleOutput = parseOracleOutput(recordedOutput)
    expect(oracleOutput.packages).toEqual(expectedPackages)
    expect(oracleOutput.matches).toEqual(expectedMatches)
  })

  test('Shape without results: throws a descriptive error', () => {
    expect(() => parseOracleOutput({ experimental_config: {} })).toThrow(
      /does not fit the expected shape/,
    )
  })

  test('Group without aliases key: merges the ids alone into one sorted match', () => {
    const oracleOutput = parseOracleOutput({
      results: [
        {
          packages: [
            {
              package: { name: 'alias-kit', version: '1.0.2' },
              groups: [{ ids: ['GHSA-ALIA-0001', 'CVE-2024-0001'] }],
            },
          ],
        },
      ],
    })
    expect(oracleOutput.matches).toEqual([
      {
        packageName: 'alias-kit',
        version: '1.0.2',
        advisoryIds: ['CVE-2024-0001', 'GHSA-ALIA-0001'],
      },
    ])
  })

  test('Package without groups key: lists the package with no match', () => {
    const oracleOutput = parseOracleOutput({
      results: [
        {
          packages: [{ package: { name: 'left-pad', version: '1.3.0' } }],
        },
      ],
    })
    expect(oracleOutput).toEqual({
      packages: [{ packageName: 'left-pad', version: '1.3.0' }],
      matches: [],
    })
  })

  test('Two results entries: merges the packages and matches of two lockfiles into sorted lists', () => {
    const oracleOutput = parseOracleOutput({
      results: [
        {
          packages: [
            {
              package: { name: 'range-kit', version: '1.0.0' },
              groups: [{ ids: ['GHSA-RANG-0002'], aliases: [] }],
            },
          ],
        },
        {
          packages: [
            { package: { name: 'left-pad', version: '1.3.0' } },
            {
              package: { name: 'alias-kit', version: '1.0.2' },
              groups: [{ ids: ['GHSA-ALIA-0001'], aliases: ['CVE-2024-0001'] }],
            },
          ],
        },
      ],
    })
    expect(oracleOutput).toEqual({
      packages: expectedPackages,
      matches: [
        {
          packageName: 'alias-kit',
          version: '1.0.2',
          advisoryIds: ['CVE-2024-0001', 'GHSA-ALIA-0001'],
        },
        {
          packageName: 'range-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-RANG-0002'],
        },
      ],
    })
  })

  test('Same package in two results entries: lists the package once and each group once', () => {
    const oracleOutput = parseOracleOutput({
      results: [
        {
          packages: [
            {
              package: { name: 'lodash', version: '4.17.20' },
              groups: [{ ids: ['GHSA-A'] }],
            },
          ],
        },
        {
          packages: [
            {
              package: { name: 'lodash', version: '4.17.20' },
              groups: [{ ids: ['GHSA-A'] }, { ids: ['GHSA-B'] }],
            },
          ],
        },
      ],
    })
    expect(oracleOutput).toEqual({
      packages: [{ packageName: 'lodash', version: '4.17.20' }],
      matches: [
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['GHSA-A'],
        },
        {
          packageName: 'lodash',
          version: '4.17.20',
          advisoryIds: ['GHSA-B'],
        },
      ],
    })
  })

  test('Group with an empty id union: drops the group and keeps the package', () => {
    const oracleOutput = parseOracleOutput({
      results: [
        {
          packages: [
            {
              package: { name: 'range-kit', version: '1.0.0' },
              groups: [
                { ids: [], aliases: [] },
                { ids: [] },
                { ids: ['GHSA-RANG-0001'] },
              ],
            },
          ],
        },
      ],
    })
    expect(oracleOutput).toEqual({
      packages: [{ packageName: 'range-kit', version: '1.0.0' }],
      matches: [
        {
          packageName: 'range-kit',
          version: '1.0.0',
          advisoryIds: ['GHSA-RANG-0001'],
        },
      ],
    })
  })
})

describe('writeOracleDatabase', () => {
  test('Database holds every advisory: writes one OSV entry per fixture advisory with its id, aliases, ranges, versions and withdrawn timestamp', async () => {
    // write the archive from the fixture advisories
    const fixtureAdvisories = await readFixtureAdvisories()
    const databaseDirectory = await createTemporaryDirectory()
    const writeOracleDatabaseResult = await writeOracleDatabase({
      advisories: fixtureAdvisories,
      databaseDirectory,
    })
    expect(writeOracleDatabaseResult).toEqual({
      archivePath: join(databaseDirectory, oracleDatabaseArchivePath),
      advisoryCount: fixtureAdvisories.length,
    })

    // read every entry back out of the archive
    const archiveBytes = await Bun.file(
      writeOracleDatabaseResult.archivePath,
    ).bytes()
    const osvEntriesById = readOsvEntries(archiveBytes)
    expect(osvEntriesById.size).toBe(fixtureAdvisories.length)

    // every advisory is there under its id with its aliases and versions
    for (const fixtureAdvisory of fixtureAdvisories) {
      const osvEntry = osvEntriesById.get(fixtureAdvisory.id)
      expect(osvEntry?.id).toBe(fixtureAdvisory.id)
      expect(osvEntry?.aliases).toEqual(fixtureAdvisory.aliases)
      expect(
        osvEntry?.affected.map((osvAffected) => osvAffected.versions),
      ).toEqual(
        fixtureAdvisory.affected.map(
          (affectedPackage) => affectedPackage.versions,
        ),
      )
    }

    // the withdrawn advisory keeps its timestamp and alias
    const withdrawnEntry = osvEntriesById.get('GHSA-WITH-0001')
    expect(withdrawnEntry?.withdrawn).toBe('2024-03-01T00:00:00Z')
    expect(withdrawnEntry?.aliases).toEqual(['CVE-2024-9001'])
    expect(withdrawnEntry?.affected[0]?.package).toEqual({
      ecosystem: 'npm',
      name: 'withdrawn-kit',
    })

    // the last affected event is spelled the OSV way
    const lastAffectedEntry = osvEntriesById.get('GHSA-LAST-0001')
    expect(lastAffectedEntry?.withdrawn).toBeUndefined()
    expect(lastAffectedEntry?.affected[0]?.ranges).toEqual([
      {
        type: 'SEMVER',
        events: [{ introduced: '1.0.0' }, { last_affected: '1.2.0' }],
      },
    ])
  })
})

describe('runOracle', () => {
  test('Binary absent: returns unavailable when PATH holds no osv-scanner', async () => {
    // empty PATH so Bun.which finds nothing, and restore it whatever happens
    const originalPath = process.env.PATH
    process.env.PATH = ''
    try {
      expect(isOracleAvailable()).toBe(false)
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory: tmpdir(),
      })
      expect(oracleResult).toEqual({
        status: 'unavailable',
        reason: `${oracleBinaryName} is not on PATH`,
      })
    } finally {
      process.env.PATH = originalPath
    }
  })

  test('Load failure beside valid JSON: returns unavailable from the stderr line although stdout holds the package list', async () => {
    // stand in for osv-scanner with the recorded output on stdout, the load failure line on stderr and exit 127
    const recordedOutputText = await Bun.file(recordedOutputPath).text()
    const restorePath = await installFakeOracle({
      stdoutText: recordedOutputText,
      stderrText: `Scanned ${fixtureLockfilePath} file and found 3 packages\n${databaseLoadFailureLine}\n`,
      exitCode: 127,
    })
    try {
      const databaseDirectory = await createTemporaryDirectory()
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory,
      })
      expect(oracleResult).toEqual({
        status: 'unavailable',
        reason: `${oracleBinaryName} could not load the database under ${databaseDirectory}: ${databaseLoadFailureLine}`,
      })
    } finally {
      restorePath()
    }
  })

  test('Failure text inside a path: returns ran when only a path on stderr holds the load failure words', async () => {
    // stand in for osv-scanner echoing a lockfile path that holds the failure words, with the recorded output and exit 1
    const recordedOutputText = await Bun.file(recordedOutputPath).text()
    const restorePath = await installFakeOracle({
      stdoutText: recordedOutputText,
      stderrText:
        'Scanned /tmp/could not load db for/package-lock.json file and found 3 packages\n',
      exitCode: 1,
    })
    try {
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory: await createTemporaryDirectory(),
      })
      expect(oracleResult).toEqual({
        status: 'ran',
        packages: expectedPackages,
        matches: expectedMatches,
      })
    } finally {
      restorePath()
    }
  })

  test('No JSON output: returns unavailable with the exit code and the stderr text', async () => {
    // stand in for osv-scanner printing no JSON and exiting 2
    const restorePath = await installFakeOracle({
      stdoutText: '',
      stderrText: 'panic: something broke\n',
      exitCode: 2,
    })
    try {
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory: await createTemporaryDirectory(),
      })
      expect(oracleResult).toEqual({
        status: 'unavailable',
        reason: `${oracleBinaryName} exited with 2 without its JSON output: panic: something broke`,
      })
    } finally {
      restorePath()
    }
  })

  test.skipIf(!isOracleAvailable())(
    'Database load failure: returns unavailable with the stderr line naming the database when the directory is empty, whatever the exit code',
    async () => {
      const emptyDatabaseDirectory = await createTemporaryDirectory()
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory: emptyDatabaseDirectory,
      })
      expect(oracleResult).toEqual({
        status: 'unavailable',
        reason: `${oracleBinaryName} could not load the database under ${emptyDatabaseDirectory}: ${databaseLoadFailureLine}`,
      })
    },
  )

  test.skipIf(!isOracleAvailable())(
    'Zero packages: returns ran with empty lists when the lockfile resolves no packages',
    async () => {
      // write the database and a lockfile with no packages
      const databaseDirectory = await createTemporaryDirectory()
      await writeOracleDatabase({
        advisories: await readFixtureAdvisories(),
        databaseDirectory,
      })
      const emptyLockfileDirectory = await createTemporaryDirectory()
      const emptyLockfilePath = join(
        emptyLockfileDirectory,
        'package-lock.json',
      )
      await Bun.write(emptyLockfilePath, emptyLockfileText)

      // the run completes with nothing seen
      const oracleResult = await runOracle({
        lockfilePath: emptyLockfilePath,
        databaseDirectory,
      })
      expect(oracleResult).toEqual({ status: 'ran', packages: [], matches: [] })
    },
  )

  test.skipIf(!isOracleAvailable())(
    'Live run: scans the fixture lockfile against a database written from the fixture advisories and matches the recorded output',
    async () => {
      // write the database the recorded output was made from
      const databaseDirectory = await createTemporaryDirectory()
      await writeOracleDatabase({
        advisories: await readFixtureAdvisories(),
        databaseDirectory,
      })

      // the live run reports the same packages and matches as the recording
      const oracleResult = await runOracle({
        lockfilePath: fixtureLockfilePath,
        databaseDirectory,
      })
      expect(oracleResult).toEqual({
        status: 'ran',
        packages: expectedPackages,
        matches: expectedMatches,
      })
    },
  )
})

// create a temporary directory that afterAll removes
async function createTemporaryDirectory(): Promise<string> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'oracle-test-'))
  temporaryDirectories.push(temporaryDirectory)
  return temporaryDirectory
}

// write a stand-in osv-scanner that prints the given streams and exits with the given code, and put its directory first on PATH. the returned function restores PATH
async function installFakeOracle({
  stdoutText,
  stderrText,
  exitCode,
}: InstallFakeOracleOptions): Promise<() => void> {
  // write both streams to files the script copies out
  const fakeBinaryDirectory = await createTemporaryDirectory()
  const stdoutPath = join(fakeBinaryDirectory, 'stdout.txt')
  const stderrPath = join(fakeBinaryDirectory, 'stderr.txt')
  await Bun.write(stdoutPath, stdoutText)
  await Bun.write(stderrPath, stderrText)

  // write the script under the binary name and make it executable
  const fakeBinaryPath = join(fakeBinaryDirectory, oracleBinaryName)
  await Bun.write(
    fakeBinaryPath,
    `#!/bin/sh\ncat "${stdoutPath}"\ncat "${stderrPath}" >&2\nexit ${exitCode}\n`,
  )
  await chmod(fakeBinaryPath, 0o755)

  // put the directory first on PATH
  const originalPath = process.env.PATH
  process.env.PATH = [fakeBinaryDirectory, originalPath ?? ''].join(delimiter)
  return () => {
    process.env.PATH = originalPath
  }
}

// unzip the archive and parse every .json entry as an OSV entry keyed by its id
function readOsvEntries(archiveBytes: Uint8Array): Map<string, OsvEntry> {
  const textDecoder = new TextDecoder()
  const osvEntriesById = new Map<string, OsvEntry>()
  for (const [entryName, entryBytes] of Object.entries(
    unzipSync(archiveBytes),
  )) {
    if (!entryName.endsWith('.json')) {
      continue
    }
    const osvEntry = JSON.parse(textDecoder.decode(entryBytes)) as OsvEntry
    osvEntriesById.set(osvEntry.id, osvEntry)
  }
  return osvEntriesById
}
