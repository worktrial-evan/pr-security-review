// tests for the advisory fixture read and the fixture app checks over files written in a temporary directory
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Advisory } from '@/shared/advisory'
import { checkFixtureApp, readAdvisoryFixture } from './fixtures'

// the temporary directory of one test, holding the fixture files it writes
let fixtureDirectory: string

beforeEach(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), 'benchmark-fixtures-test-'))
})

afterEach(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true })
})

// one advisory affecting lodash, in the shared shape
const lodashAdvisory: Advisory = {
  id: 'PRR-TEST-1',
  aliases: [],
  summary: 'made-up advisory for the fixture tests',
  details: 'affects lodash below 4.17.21',
  affected: [
    {
      ecosystem: 'npm',
      name: 'lodash',
      ranges: [
        { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] },
      ],
      versions: [],
    },
  ],
  references: [],
  published: '2024-01-01T00:00:00Z',
  modified: '2024-01-01T00:00:00Z',
  isGithubReviewed: true,
}

// a bun.lock naming lodash and ms
const bunLockfileText = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "fixture-app", "dependencies": { "lodash": "4.17.21", "ms": "2.1.3" } },
  },
  "packages": {
    "lodash": ["lodash@4.17.21", "", {}, "sha512-notarealintegrityvalue"],
    "ms": ["ms@2.1.3", "", {}, "sha512-notarealintegrityvalue"],
  }
}
`

// a package-lock.json naming the same two packages
const npmLockfileText = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture-app' },
    'node_modules/lodash': { version: '4.17.21' },
    'node_modules/ms': { version: '2.1.3' },
  },
})

describe('readAdvisoryFixture', () => {
  test('reads the advisories and the known-clean list', async () => {
    await writeFile(
      join(fixtureDirectory, 'advisories.json'),
      JSON.stringify([lodashAdvisory]),
    )
    await writeFile(
      join(fixtureDirectory, 'known-clean.json'),
      JSON.stringify({ packages: ['ms'] }),
    )
    const advisoryFixtureRead = await readAdvisoryFixture(fixtureDirectory)
    expect(advisoryFixtureRead.advisories).toEqual([lodashAdvisory])
    expect(advisoryFixtureRead.knownCleanPackages).toEqual(['ms'])
    expect(advisoryFixtureRead.problems).toEqual([])
  })

  test('names a missing advisories.json', async () => {
    const advisoryFixtureRead = await readAdvisoryFixture(fixtureDirectory)
    expect(advisoryFixtureRead.advisories).toEqual([])
    expect(advisoryFixtureRead.problems).toEqual([
      'advisory fixture has no advisories.json',
    ])
  })

  test('names an advisory that does not match the contract', async () => {
    // an advisory without the required aliases list
    await writeFile(
      join(fixtureDirectory, 'advisories.json'),
      JSON.stringify([{ ...lodashAdvisory, aliases: undefined }]),
    )
    const advisoryFixtureRead = await readAdvisoryFixture(fixtureDirectory)
    expect(advisoryFixtureRead.problems).toHaveLength(1)
    expect(advisoryFixtureRead.problems[0]).toContain(
      'advisories.json does not match the advisory contract',
    )
    expect(advisoryFixtureRead.problems[0]).toContain('0.aliases')
  })

  test('treats a missing known-clean.json as an empty list and names a malformed one', async () => {
    // no known-clean file at all
    await writeFile(
      join(fixtureDirectory, 'advisories.json'),
      JSON.stringify([lodashAdvisory]),
    )
    const withoutListRead = await readAdvisoryFixture(fixtureDirectory)
    expect(withoutListRead.knownCleanPackages).toEqual([])
    expect(withoutListRead.problems).toEqual([])

    // a known-clean file without a packages list
    await writeFile(
      join(fixtureDirectory, 'known-clean.json'),
      JSON.stringify({ names: ['ms'] }),
    )
    const malformedListRead = await readAdvisoryFixture(fixtureDirectory)
    expect(malformedListRead.advisories).toEqual([lodashAdvisory])
    expect(malformedListRead.problems).toHaveLength(1)
    expect(malformedListRead.problems[0]).toContain(
      'known-clean.json does not hold a packages list',
    )
  })
})

describe('checkFixtureApp', () => {
  test('passes when the lockfiles agree and every package is covered', async () => {
    await writeFile(join(fixtureDirectory, 'bun.lock'), bunLockfileText)
    await writeFile(
      join(fixtureDirectory, 'package-lock.json'),
      npmLockfileText,
    )
    const messages = await checkFixtureApp({
      fixtureAppDirectory: fixtureDirectory,
      advisories: [lodashAdvisory],
      knownCleanPackages: ['ms'],
    })
    expect(messages).toEqual([])
  })

  test('names a missing lockfile and stops there', async () => {
    await writeFile(join(fixtureDirectory, 'bun.lock'), bunLockfileText)
    const messages = await checkFixtureApp({
      fixtureAppDirectory: fixtureDirectory,
      advisories: [lodashAdvisory],
      knownCleanPackages: ['ms'],
    })
    expect(messages).toEqual(['fixture app has no package-lock.json'])
  })

  test('names a version only one lockfile holds and a package nothing covers', async () => {
    // the npm lockfile holds ms at another version and the advisories leave ms uncovered
    await writeFile(join(fixtureDirectory, 'bun.lock'), bunLockfileText)
    await writeFile(
      join(fixtureDirectory, 'package-lock.json'),
      npmLockfileText.replace('2.1.3', '2.1.2'),
    )
    const messages = await checkFixtureApp({
      fixtureAppDirectory: fixtureDirectory,
      advisories: [lodashAdvisory],
      knownCleanPackages: [],
    })
    expect(messages).toEqual([
      'bun.lock names ms@2.1.3 but package-lock.json does not',
      'package-lock.json names ms@2.1.2 but bun.lock does not',
      'package ms has no advisory in the fixture and is not listed in known-clean.json',
    ])
  })

  test('names a bun.lock that is not valid jsonc', async () => {
    await writeFile(join(fixtureDirectory, 'bun.lock'), '{ "packages": [ ')
    await writeFile(
      join(fixtureDirectory, 'package-lock.json'),
      npmLockfileText,
    )
    const messages = await checkFixtureApp({
      fixtureAppDirectory: fixtureDirectory,
      advisories: [lodashAdvisory],
      knownCleanPackages: ['ms'],
    })
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('bun.lock is not valid jsonc')
  })
})
