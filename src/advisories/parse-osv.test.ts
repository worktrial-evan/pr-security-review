// tests the mapping of real OSV entries onto the Advisory contract
import { describe, expect, test } from 'bun:test'
import type { Advisory } from '@/shared/advisory'
import { type OsvFixtureName, readOsvFixture } from './osv-fixtures'
import { listAffectedNpmPackageNames } from './package-name'
import { parseOsvEntry } from './parse-osv'

// parse one fixture and fail the test when it does not parse
async function parseFixture(osvFixtureName: OsvFixtureName): Promise<Advisory> {
  const osvEntry = await readOsvFixture(osvFixtureName)
  const parseOsvEntryResult = parseOsvEntry(osvEntry)
  if (parseOsvEntryResult.status === 'failed') {
    throw new Error(parseOsvEntryResult.message)
  }
  return parseOsvEntryResult.advisory
}

describe('parseOsvEntry', () => {
  test('keeps the id, aliases and references', async () => {
    const osvEntry = await readOsvFixture('cvss-v3-and-v4')
    const advisory = await parseFixture('cvss-v3-and-v4')
    expect(advisory.id).toBe('GHSA-xxjr-mmjv-4gpg')
    expect(advisory.aliases).toEqual([
      'CVE-2025-13465',
      'CVE-2026-2950',
      'GHSA-f23m-r3pf-42rh',
    ])
    expect(advisory.references).toHaveLength(5)
    expect(osvEntry.references).toEqual(advisory.references)
  })

  test('prefixes https to a reference url written without a scheme', async () => {
    const advisory = await parseFixture('reference-without-scheme')
    const referenceUrls = advisory.references.map((reference) => reference.url)
    expect(referenceUrls).toContain('https://github.com/npm/cli')
    expect(referenceUrls).toContain(
      'http://blog.npmjs.org/post/171169301000/v571',
    )
  })

  test('fails on a reference url that is not a url at all', async () => {
    const osvEntry = await readOsvFixture('withdrawn')
    const malformedEntry = {
      ...osvEntry,
      references: [{ type: 'WEB', url: 'not a url' }],
    }
    const parseOsvEntryResult = parseOsvEntry(malformedEntry)
    expect(parseOsvEntryResult.status).toBe('failed')
  })

  test('prefers the CVSS v3 vector and scores it', async () => {
    const advisory = await parseFixture('cvss-v3-and-v4')
    expect(advisory.severityVector).toBe(
      'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L',
    )
    expect(advisory.severityScore).toBe(6.5)
  })

  test('keeps a CVSS v4 vector without a score', async () => {
    const advisory = await parseFixture('cvss-v4-only')
    expect(advisory.severityVector).toStartWith('CVSS:4.0/')
    expect(advisory.severityScore).toBeUndefined()
  })

  test('leaves severity absent when the entry has no CVSS entry', async () => {
    const advisory = await parseFixture('withdrawn')
    expect(advisory.severityVector).toBeUndefined()
    expect(advisory.severityScore).toBeUndefined()
  })

  test('keeps the withdrawn timestamp', async () => {
    const advisory = await parseFixture('withdrawn')
    expect(advisory.withdrawn).toBe('2020-06-16T20:53:33Z')
  })

  test('leaves withdrawn absent on a live entry', async () => {
    const advisory = await parseFixture('cvss-v3-and-v4')
    expect(advisory.withdrawn).toBeUndefined()
  })

  test('renames last_affected to lastAffected', async () => {
    const advisory = await parseFixture('last-affected')
    const unscopedXmldom = advisory.affected.find(
      (affectedPackage) => affectedPackage.name === 'xmldom',
    )
    expect(unscopedXmldom?.ranges).toEqual([
      {
        type: 'SEMVER',
        events: [{ introduced: '0' }, { lastAffected: '0.6.0' }],
      },
    ])
  })

  test('turns missing aliases and references into empty lists', async () => {
    const advisory = await parseFixture('malicious-package')
    expect(advisory.aliases).toEqual([])
    expect(advisory.references).toEqual([])
    expect(advisory.affected[0]?.ranges).toEqual([])
    expect(advisory.affected[0]?.versions).toHaveLength(1)
  })

  test('drops an affected item that names no package', async () => {
    const advisory = await parseFixture('affected-without-package')
    const affectedNames = advisory.affected.map(
      (affectedPackage) =>
        `${affectedPackage.ecosystem}:${affectedPackage.name}`,
    )
    expect(affectedNames).toEqual(['Hex:phoenix', 'npm:phoenix'])
  })

  test('reads github_reviewed true, false and absent', async () => {
    const reviewedAdvisory = await parseFixture('github-reviewed-true')
    const notReviewedAdvisory = await parseFixture('github-reviewed-false')
    const unflaggedAdvisory = await parseFixture('github-reviewed-absent')
    expect(reviewedAdvisory.isGithubReviewed).toBe(true)
    expect(notReviewedAdvisory.isGithubReviewed).toBe(false)
    expect(unflaggedAdvisory.isGithubReviewed).toBe(false)
  })

  test('fails on an unknown range type and names the field', async () => {
    const osvEntry = await readOsvFixture('withdrawn')
    const malformedEntry = structuredClone(osvEntry) as {
      affected: { ranges: { type: string }[] }[]
    }
    const firstRange = malformedEntry.affected[0]?.ranges[0]
    if (firstRange === undefined) {
      throw new Error('the withdrawn fixture has no range')
    }
    firstRange.type = 'CALVER'
    const parseOsvEntryResult = parseOsvEntry(malformedEntry)
    expect(parseOsvEntryResult.status).toBe('failed')
    if (parseOsvEntryResult.status === 'failed') {
      expect(parseOsvEntryResult.message).toContain(
        'affected[0].ranges[0].type',
      )
    }
  })

  test('fails on an unknown range event key', async () => {
    const osvEntry = await readOsvFixture('withdrawn')
    const malformedEntry = structuredClone(osvEntry) as {
      affected: { ranges: { events: Record<string, string>[] }[] }[]
    }
    malformedEntry.affected[0]?.ranges[0]?.events.push({ limit: '3.0.0' })
    const parseOsvEntryResult = parseOsvEntry(malformedEntry)
    expect(parseOsvEntryResult.status).toBe('failed')
  })

  test('fails when a required field is missing', () => {
    const parseOsvEntryResult = parseOsvEntry({ id: 'GHSA-0000-0000-0000' })
    expect(parseOsvEntryResult.status).toBe('failed')
  })
})

describe('package names', () => {
  test('lists the normalized npm packages an advisory affects, each once', async () => {
    const uppercaseAdvisory = await parseFixture('uppercase-name')
    const xmldomAdvisory = await parseFixture('last-affected')
    const crossEcosystemAdvisory = await parseFixture('github-reviewed-true')
    expect(listAffectedNpmPackageNames(uppercaseAdvisory)).toEqual(['haraka'])
    expect(listAffectedNpmPackageNames(xmldomAdvisory)).toEqual([
      '@xmldom/xmldom',
      'xmldom',
    ])
    expect(listAffectedNpmPackageNames(crossEcosystemAdvisory)).toEqual([
      'lodash',
    ])
  })
})
