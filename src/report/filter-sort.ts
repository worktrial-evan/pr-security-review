// the pure filter and sort function behind the report table, also embedded into the page as source text
import type { CellValue, ColumnKey, ReportRow } from './report-rows'

// which way a column sorts
export type SortDirection = 'ascending' | 'descending'

// the column the rows are sorted by and the direction
export interface SortState {
  column: ColumnKey
  direction: SortDirection
}

// the values selected in each filter. a missing or empty list means no filter
export type FilterSelections = Partial<Record<ColumnKey, string[]>>

// the rows to choose from, the filters and sort to apply, and the severities from most to least severe
export interface SelectRowsOptions {
  rows: ReportRow[]
  selections: FilterSelections
  sort: SortState | null
  severityOrder: string[]
}

// the two cells to compare in one column
interface CompareCellsOptions {
  left: CellValue
  right: CellValue
  column: ColumnKey
  severityOrder: string[]
}

/**
 * Returns the ids of the rows that pass every filter, in sorted order.
 * Everything this function uses is defined in this file, so the page can run it from source text.
 */
export function selectRows({
  rows,
  selections,
  sort,
  severityOrder,
}: SelectRowsOptions): string[] {
  // keep the rows that pass every filter with a selection
  const filteredRows = rows.filter((row) => matchesSelections(row, selections))
  if (sort === null) {
    return filteredRows.map((row) => row.findingId)
  }

  // set aside the rows with no value in the sorted column, since they always go last
  const rowsWithValue = filteredRows.filter(
    (row) => row.cells[sort.column] !== null,
  )
  const rowsWithoutValue = filteredRows.filter(
    (row) => row.cells[sort.column] === null,
  )

  // sort the rest. ties keep their original order in both directions
  const directionFactor = sort.direction === 'ascending' ? 1 : -1
  const sortedRows = [...rowsWithValue].sort(
    (leftRow, rightRow) =>
      directionFactor *
      compareCells({
        left: leftRow.cells[sort.column],
        right: rightRow.cells[sort.column],
        column: sort.column,
        severityOrder,
      }),
  )

  return [...sortedRows, ...rowsWithoutValue].map((row) => row.findingId)
}

// tell whether a row has one of the selected values in every filter that has a selection
function matchesSelections(
  row: ReportRow,
  selections: FilterSelections,
): boolean {
  // check each filter. a row with no value in the column never matches a selection
  for (const [column, selectedValues] of Object.entries(selections)) {
    if (selectedValues === undefined || selectedValues.length === 0) {
      continue
    }
    const cellValue = row.cells[column as ColumnKey]
    if (cellValue === null || !selectedValues.includes(String(cellValue))) {
      return false
    }
  }
  return true
}

// compare two non-null cells in ascending order. severity by rank, numbers by value, text by natural order
function compareCells({
  left,
  right,
  column,
  severityOrder,
}: CompareCellsOptions): number {
  if (column === 'severity') {
    return (
      severityOrder.indexOf(String(left)) - severityOrder.indexOf(String(right))
    )
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true })
}

/**
 * Returns the source text of the filter and sort functions, ready to embed in a page.
 */
export function getFilterSortSource(): string {
  const functions = [selectRows, matchesSelections, compareCells]
  return functions
    .map((filterSortFunction) => filterSortFunction.toString())
    .join('\n\n')
}
