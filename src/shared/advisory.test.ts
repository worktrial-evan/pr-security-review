// tests for the advisory contract: an advisory and a snapshot round-trip, and a bad range type is rejected
import { describe, expect, test } from 'bun:test'
import {
  type Advisory,
  type AdvisorySnapshot,
  advisoryRangeSchema,
  advisorySchema,
  advisorySnapshotSchema,
} from './advisory'

// the lodash command injection advisory, trimmed to the contract
const advisorySample: Advisory = {
  id: 'GHSA-35jh-r3h4-6jhm',
  aliases: ['CVE-2021-23337'],
  summary: 'Command Injection in lodash',
  details:
    'lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.',
  severityScore: 7.2,
  severityVector: 'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H',
  affected: [
    {
      ecosystem: 'npm',
      name: 'lodash',
      ranges: [
        { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] },
      ],
      versions: ['4.17.20'],
    },
  ],
  references: [
    {
      type: 'ADVISORY',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337',
    },
  ],
  published: '2021-05-06T16:09:28Z',
  modified: '2024-04-11T15:18:49.123Z',
  isGithubReviewed: true,
}

// a snapshot of the npm advisory feed
const advisorySnapshotSample: AdvisorySnapshot = {
  fetchedAt: '2026-10-15T08:30:00.000Z',
  sourceUrl: 'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip',
  entryCount: 12345,
  sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
}

describe('advisorySchema', () => {
  test('an advisory round-trips', () => {
    expect(advisorySchema.parse(advisorySample)).toEqual(advisorySample)
  })
})

describe('advisorySnapshotSchema', () => {
  test('a snapshot round-trips', () => {
    expect(advisorySnapshotSchema.parse(advisorySnapshotSample)).toEqual(
      advisorySnapshotSample,
    )
  })
})

describe('advisoryRangeSchema', () => {
  test('a range type other than SEMVER, ECOSYSTEM or GIT is rejected', () => {
    // give the range a type outside the advisory range types
    const badRange = { type: 'CALVER', events: [{ introduced: '0' }] }
    expect(() => advisoryRangeSchema.parse(badRange)).toThrow(/type/)
  })
})
