// renders the filter controls and the findings table with one expandable detail row per finding
import { dependencyScopes } from '../shared/dependency'
import {
  detectorKinds,
  type Finding,
  matcherAgreements,
  reachabilityKinds,
  severities,
} from '../shared/finding'
import { escapeHtml } from './html-escape'
import { renderAdvisoryLinks, renderDetail } from './render-detail'
import { emptyValueText, formatConfidence } from './report-format'
import {
  type CellValue,
  type ColumnKey,
  columnKeys,
  type ReportRow,
  toReportRow,
} from './report-rows'

// the header text of each column
const columnLabels: Record<ColumnKey, string> = {
  severity: 'Severity',
  detector: 'Detector',
  title: 'Title',
  location: 'File and lines',
  package: 'Package and version',
  advisory: 'Advisory',
  githubReviewed: 'GitHub reviewed',
  dependencyScope: 'Dependency scope',
  reachability: 'Reachability',
  matcherAgreement: 'Matcher agreement',
  cwe: 'CWE',
  confidence: 'Confidence',
  introduced: 'Introduced by pull request',
}

// a filter control: the column it filters, its label and the values it offers
interface FilterDefinition {
  column: ColumnKey
  label: string
  values: readonly string[]
}

// the filters in display order. every value of each enum is offered
const filterDefinitions: FilterDefinition[] = [
  { column: 'detector', label: 'Detector', values: detectorKinds },
  { column: 'severity', label: 'Severity', values: severities },
  {
    column: 'dependencyScope',
    label: 'Dependency scope',
    values: dependencyScopes,
  },
  { column: 'githubReviewed', label: 'GitHub reviewed', values: ['yes', 'no'] },
  { column: 'reachability', label: 'Reachability', values: reachabilityKinds },
  {
    column: 'matcherAgreement',
    label: 'Matcher agreement',
    values: matcherAgreements,
  },
  {
    column: 'introduced',
    label: 'Introduced by pull request',
    values: ['yes', 'no'],
  },
]

// the finding and row to render as one table row and its detail row
interface RenderFindingRowsOptions {
  finding: Finding
  row: ReportRow
}

// the finding, column and value of one cell
interface RenderCellOptions {
  finding: Finding
  column: ColumnKey
  value: CellValue
}

/**
 * Renders the filter controls and the shown versus total row count.
 */
export function renderFilters(totalCount: number): string {
  const filterHtml = filterDefinitions.map(renderFilter)
  const countHtml = `<p class="row-count" aria-live="polite">Showing <span id="rows-shown">${totalCount}</span> of <span id="rows-total">${totalCount}</span> findings</p>`
  return `<section class="filters" aria-label="Filters">${filterHtml.join('')}${countHtml}</section>`
}

/**
 * Renders the findings table, one row and one hidden detail row per finding.
 */
export function renderTable(findings: Finding[]): string {
  // render the header cells with a sort button in each
  const headerCells = columnKeys.map(
    (column) =>
      `<th scope="col" data-column="${column}" aria-sort="none"><button type="button">${columnLabels[column]}</button></th>`,
  )

  // render each finding with its row of values
  const bodyRows = findings.map((finding) =>
    renderFindingRows({ finding, row: toReportRow(finding) }),
  )

  return [
    '<div class="table-scroll">',
    '<table id="findings">',
    `<thead><tr>${headerCells.join('')}</tr></thead>`,
    `<tbody>${bodyRows.join('')}</tbody>`,
    '</table>',
    '</div>',
  ].join('\n')
}

// render one filter as a group of checkboxes under a summary
function renderFilter({ column, label, values }: FilterDefinition): string {
  const checkboxes = values.map(
    (value) =>
      `<label><input type="checkbox" value="${escapeHtml(value)}"> ${escapeHtml(value)}</label>`,
  )
  return `<details class="filter" data-filter="${column}"><summary data-label="${label}">${label}</summary><div class="filter-values">${checkboxes.join('')}</div></details>`
}

// render a finding's table row followed by its hidden detail row
function renderFindingRows({ finding, row }: RenderFindingRowsOptions): string {
  // mute the row of a finding the pull request did not introduce
  const rowClass = finding.isIntroducedByPullRequest
    ? 'finding'
    : 'finding muted'
  const cells = columnKeys.map((column) =>
    renderCell({ finding, column, value: row.cells[column] }),
  )
  const findingId = escapeHtml(finding.id)

  // follow the row with the detail it expands to
  const tableRow = `<tr class="${rowClass}" data-finding-id="${findingId}" tabindex="0" aria-expanded="false">${cells.join('')}</tr>`
  const detailRow = `<tr class="detail" data-detail-for="${findingId}" hidden><td colspan="${columnKeys.length}">${renderDetail(finding)}</td></tr>`
  return tableRow + detailRow
}

// render one cell, or a dash cell when the column does not apply
function renderCell({ finding, column, value }: RenderCellOptions): string {
  if (value === null) {
    return `<td class="empty">${emptyValueText}</td>`
  }
  const text = escapeHtml(String(value))

  // render the columns that need more than escaped text
  if (column === 'severity') {
    return `<td><span class="badge severity-${text}">${text}</span></td>`
  }
  if (column === 'location' || column === 'package') {
    return `<td><code>${text}</code></td>`
  }
  if (column === 'advisory' && finding.detector === 'sca') {
    return `<td>${renderAdvisoryLinks(finding)}</td>`
  }
  if (column === 'confidence') {
    return `<td>${formatConfidence(Number(value))}</td>`
  }
  return `<td>${text}</td>`
}
