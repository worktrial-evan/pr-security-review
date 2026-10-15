// tests that findings become one row each, with null in the columns a detector does not have
import { describe, expect, test } from 'bun:test'
import { fixtureReviewResult } from './fixtures/review-result'
import { type ReportRow, toReportRows } from './report-rows'

// the fixture rows in finding order
const fixtureRows = toReportRows(fixtureReviewResult.findings)

// find the row of the first fixture finding from one detector
function findFirstRow(detector: string): ReportRow | undefined {
  const findingIndex = fixtureReviewResult.findings.findIndex(
    (finding) => finding.detector === detector,
  )
  return fixtureRows[findingIndex]
}

describe('toReportRows', () => {
  test('makes one row per finding with the finding id', () => {
    const rowIds = fixtureRows.map((row) => row.findingId)
    const findingIds = fixtureReviewResult.findings.map(({ id }) => id)
    expect(rowIds).toEqual(findingIds)
  })

  test('fills the sca columns of an sca finding', () => {
    expect(findFirstRow('sca')?.cells).toEqual({
      severity: 'high',
      detector: 'sca',
      title: 'lodash 4.17.20 is affected by GHSA-35jh-r3h4-6jhm',
      location: 'package.json:12',
      package: 'lodash@4.17.20',
      advisory: 'GHSA-35jh-r3h4-6jhm',
      githubReviewed: 'yes',
      dependencyScope: 'prod',
      reachability: 'direct-imported',
      matcherAgreement: 'both',
      cwe: null,
      confidence: 0.95,
      introduced: 'yes',
    })
  })

  test('fills only the cwe column of a code review finding', () => {
    const cells = findFirstRow('code-review')?.cells
    expect(cells?.cwe).toBe('CWE-89')
    expect(cells?.location).toBe('src/db/search.ts:41-47')
    expect(cells?.package).toBeNull()
    expect(cells?.reachability).toBeNull()
  })

  test('leaves every detector column null for a secrets finding', () => {
    const cells = findFirstRow('secrets')?.cells
    expect(cells?.package).toBeNull()
    expect(cells?.advisory).toBeNull()
    expect(cells?.githubReviewed).toBeNull()
    expect(cells?.dependencyScope).toBeNull()
    expect(cells?.matcherAgreement).toBeNull()
    expect(cells?.cwe).toBeNull()
  })

  test('uses a null location for a finding without a file', () => {
    const rowWithoutFile = fixtureRows.find(
      (row) => row.cells.cwe === 'CWE-307',
    )
    expect(rowWithoutFile?.cells.location).toBeNull()
  })
})
