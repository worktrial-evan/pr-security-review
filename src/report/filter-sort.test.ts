// tests the filter and sort function: AND filters, severity rank, nulls last, stable ties and the embedded source
import { describe, expect, test } from 'bun:test'
import { severities } from '../shared/finding'
import {
  type FilterSelections,
  getFilterSortSource,
  type SortState,
  selectRows,
} from './filter-sort'
import { fixtureReviewResult } from './fixtures/review-result'
import { type CellValue, type ColumnKey, toReportRows } from './report-rows'

// the fixture rows in finding order
const fixtureRows = toReportRows(fixtureReviewResult.findings)

// the severities in the order the page passes them
const severityOrder: string[] = [...severities]

// run selectRows over the fixture rows with the given filters and sort
function selectFixtureIds(
  selections: FilterSelections,
  sort: SortState | null,
): string[] {
  return selectRows({ rows: fixtureRows, selections, sort, severityOrder })
}

// read one column of the fixture rows for the given ids, in id order
function readColumn(
  ids: string[],
  column: ColumnKey,
): Array<CellValue | undefined> {
  return ids.map(
    (id) => fixtureRows.find((row) => row.findingId === id)?.cells[column],
  )
}

describe('selectRows filters', () => {
  test('returns every row in the original order with no selections and no sort', () => {
    const ids = selectFixtureIds({}, null)
    expect(ids).toEqual(fixtureRows.map((row) => row.findingId))
  })

  test('treats an empty selection list as no filter', () => {
    const ids = selectFixtureIds({ severity: [] }, null)
    expect(ids).toHaveLength(fixtureRows.length)
  })

  test('combines filters with AND', () => {
    const ids = selectFixtureIds(
      { detector: ['dependency'], severity: ['high'] },
      null,
    )
    const expectedIds = fixtureReviewResult.findings
      .filter(
        (finding) =>
          finding.detector === 'dependency' && finding.severity === 'high',
      )
      .map((finding) => finding.id)
    expect(ids).toEqual(expectedIds)
    expect(ids.length).toBeGreaterThan(0)
  })

  test('accepts several values in one filter', () => {
    const ids = selectFixtureIds({ severity: ['critical', 'info'] }, null)
    const severitiesShown = new Set(readColumn(ids, 'severity'))
    expect(severitiesShown).toEqual(new Set(['critical', 'info']))
  })

  test('hides rows of other detectors when a dependency-only filter has a selection', () => {
    const ids = selectFixtureIds({ reachability: ['transitive'] }, null)
    const detectorsShown = new Set(readColumn(ids, 'detector'))
    expect(detectorsShown).toEqual(new Set(['dependency']))
    expect(ids.length).toBeGreaterThan(0)
  })

  test('filters on introduced by pull request', () => {
    const ids = selectFixtureIds({ introduced: ['no'] }, null)
    const expectedCount = fixtureReviewResult.findings.filter(
      (finding) => !finding.isIntroducedByPullRequest,
    ).length
    expect(ids).toHaveLength(expectedCount)
  })

  test('returns nothing when no row matches', () => {
    const ids = selectFixtureIds(
      { detector: ['secrets'], vulnerabilityType: ['CWE-89'] },
      null,
    )
    expect(ids).toEqual([])
  })
})

describe('selectRows sorting', () => {
  test('sorts severity by rank, critical first when ascending', () => {
    const ids = selectFixtureIds(
      {},
      { column: 'severity', direction: 'ascending' },
    )
    const ranks = readColumn(ids, 'severity').map((severity) =>
      severityOrder.indexOf(String(severity)),
    )
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right))
    expect(readColumn(ids, 'severity')[0]).toBe('critical')
  })

  test('sorts severity info first when descending', () => {
    const ids = selectFixtureIds(
      {},
      { column: 'severity', direction: 'descending' },
    )
    expect(readColumn(ids, 'severity')[0]).toBe('info')
  })

  test('sorts numbers by value and not as text', () => {
    const ids = selectFixtureIds(
      {},
      { column: 'confidence', direction: 'ascending' },
    )
    const confidences = readColumn(ids, 'confidence') as number[]
    expect(confidences).toEqual(
      [...confidences].sort((left, right) => left - right),
    )
  })

  test('puts rows with a dash last in both directions', () => {
    const ascendingIds = selectFixtureIds(
      {},
      { column: 'vulnerabilityType', direction: 'ascending' },
    )
    const descendingIds = selectFixtureIds(
      {},
      { column: 'vulnerabilityType', direction: 'descending' },
    )
    const vulnerabilityTypeCount = fixtureRows.filter(
      (row) => row.cells.vulnerabilityType !== null,
    ).length
    expect(
      readColumn(ascendingIds, 'vulnerabilityType').slice(
        vulnerabilityTypeCount,
      ),
    ).toEqual(new Array(fixtureRows.length - vulnerabilityTypeCount).fill(null))
    expect(
      readColumn(descendingIds, 'vulnerabilityType').slice(
        vulnerabilityTypeCount,
      ),
    ).toEqual(new Array(fixtureRows.length - vulnerabilityTypeCount).fill(null))
    expect(readColumn(ascendingIds, 'vulnerabilityType')[0]).toBe('CWE-22')
    expect(readColumn(descendingIds, 'vulnerabilityType')[0]).toBe('CWE-918')
  })

  test('reverses the order of different values when the direction flips', () => {
    const ascendingIds = selectFixtureIds(
      {},
      { column: 'title', direction: 'ascending' },
    )
    const descendingIds = selectFixtureIds(
      {},
      { column: 'title', direction: 'descending' },
    )
    expect(descendingIds).toEqual([...ascendingIds].reverse())
  })

  test('keeps the original order of rows that tie, in both directions', () => {
    // each detector group must keep the finding order whichever way the column sorts
    for (const direction of ['ascending', 'descending'] as const) {
      const ids = selectFixtureIds({}, { column: 'detector', direction })
      for (const detector of ['dependency', 'code-review', 'secrets']) {
        const idsOfDetector = ids.filter(
          (id) => readColumn([id], 'detector')[0] === detector,
        )
        const originalIdsOfDetector = fixtureRows
          .filter((row) => row.cells.detector === detector)
          .map((row) => row.findingId)
        expect(idsOfDetector).toEqual(originalIdsOfDetector)
      }
    }
  })

  test('applies filters before sorting', () => {
    const ids = selectFixtureIds(
      { detector: ['code-review'] },
      { column: 'severity', direction: 'ascending' },
    )
    expect(
      readColumn(ids, 'detector').every(
        (detector) => detector === 'code-review',
      ),
    ).toBe(true)
    expect(readColumn(ids, 'severity')[0]).toBe('critical')
  })
})

describe('getFilterSortSource', () => {
  test('runs from source text and returns what the imported function returns', () => {
    // evaluate the embedded text the way the page does
    const embeddedSelectRows = new Function(
      `${getFilterSortSource()}\nreturn selectRows`,
    )() as typeof selectRows

    const options = {
      rows: fixtureRows,
      selections: {
        detector: ['dependency', 'code-review'],
        introduced: ['yes'],
      },
      sort: { column: 'severity', direction: 'ascending' } as SortState,
      severityOrder,
    }
    expect(embeddedSelectRows(options)).toEqual(selectRows(options))
  })

  test('contains no import or type annotation', () => {
    const source = getFilterSortSource()
    expect(source).not.toContain('import ')
    expect(source).not.toContain('SelectRowsOptions')
  })
})
