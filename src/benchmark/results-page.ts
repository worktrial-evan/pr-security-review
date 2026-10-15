// renders the results of a benchmark run as a self-contained html page with a metrics table and a filterable per-case table, on the report module's escaping, styles and value formats
import { escapeHtml } from '@/report/html-escape'
import { pageStyle } from '@/report/page-style'
import { emptyValueText, formatCostUsd } from '@/report/report-format'
import { benchmarkCategories, benchmarkSplits } from '@/shared/benchmark'
import { detectorKinds } from '@/shared/finding'
import type { BenchmarkRunResults } from './run-results'
import { type BenchmarkCaseDetail, benchmarkCaseStatuses } from './score'

// one row of the metrics table
interface MetricsRow {
  name: string
  precision: number
  recall: number
  f1: number
}

// one select above the per-case table: the row attribute it filters on and its values
interface CaseFilter {
  attribute: string
  label: string
  values: readonly string[]
}

// the three filters above the per-case table
const caseFilters: CaseFilter[] = [
  { attribute: 'category', label: 'Category', values: benchmarkCategories },
  { attribute: 'split', label: 'Split', values: benchmarkSplits },
  { attribute: 'status', label: 'Status', values: benchmarkCaseStatuses },
]

// the rules the benchmark tables need on top of the report module's stylesheet
const benchmarkPageStyle = `
  table { border-collapse: collapse; margin-bottom: 2rem; }
  th, td { border: 1px solid var(--border); padding: 0.3rem 0.6rem; text-align: left; }
  th { background: var(--surface); }
  td.number { text-align: right; font-variant-numeric: tabular-nums; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; }
  dt { font-weight: 600; }
  dd { margin: 0; }
  .filters { display: flex; gap: 1rem; margin-bottom: 1rem; }
  .warning { color: var(--critical); }
`

// the script that hides the case rows the selects do not match
const filterScript = `
  // read every filter select and every case row once
  const filterSelects = Array.from(document.querySelectorAll('select[data-filter]'))
  const caseRows = Array.from(document.querySelectorAll('tr[data-case]'))

  // show a row only when every select is on all or on the row's value
  function applyFilters() {
    for (const caseRow of caseRows) {
      const isShown = filterSelects.every((filterSelect) => {
        const attribute = filterSelect.dataset.filter
        return filterSelect.value === 'all' || caseRow.dataset[attribute] === filterSelect.value
      })
      caseRow.hidden = !isShown
    }
  }

  // filter again whenever a select changes
  for (const filterSelect of filterSelects) {
    filterSelect.addEventListener('change', applyFilters)
  }
`

/**
 * Renders the results of a benchmark run as one html page with no external resources.
 */
export function renderResultsPage(results: BenchmarkRunResults): string {
  // name the page by its label and split
  const title = `Benchmark run ${results.label} (${results.split})`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${pageStyle}${benchmarkPageStyle}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${renderProvenance(results)}
${renderWarnings(results.warnings)}
<h2>Metrics</h2>
${renderMetricsTable(results)}
<h2>Totals</h2>
${renderTotals(results)}
<h2>Cases</h2>
${renderCaseFilters()}
${renderCaseTable(results.cases)}
<script>${filterScript}</script>
</body>
</html>
`
}

// render the provenance of the run as a definition list
function renderProvenance(results: BenchmarkRunResults): string {
  // list every provenance field with its value
  const provenanceEntries: [string, string][] = [
    ['Label', results.label],
    ['Split', results.split],
    ['Started at', results.startedAt],
    ['Finished at', results.finishedAt],
    ['Git sha', results.gitSha],
    ['Prompt versions', formatRecord(results.promptVersions)],
    ['Model ids', formatRecord(results.modelIds)],
    ['Advisory snapshot date', results.advisorySnapshotDate],
    ['LLM cache used', String(results.isLlmCacheUsed)],
  ]

  // render each entry as a term and its value
  const provenanceItems = provenanceEntries.map(
    ([term, value]) =>
      `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`,
  )
  return `<dl>${provenanceItems.join('')}</dl>`
}

// render the warnings of the run, or nothing when there are none
function renderWarnings(warnings: string[]): string {
  // nothing to warn about
  if (warnings.length === 0) {
    return ''
  }

  // render each warning as a list item
  const warningItems = warnings.map(
    (warning) => `<li class="warning">${escapeHtml(warning)}</li>`,
  )
  return `<h2>Warnings</h2><ul>${warningItems.join('')}</ul>`
}

// render the overall triple and the breakdowns by detector and by category as one table
function renderMetricsTable(results: BenchmarkRunResults): string {
  // the overall row first, then one row per detector and per category that scored
  const { score } = results
  const metricsRows: MetricsRow[] = [
    {
      name: 'overall',
      precision: score.precision,
      recall: score.recall,
      f1: score.f1,
    },
  ]
  for (const detectorKind of detectorKinds) {
    const detectorTriple = score.byDetector[detectorKind]
    if (detectorTriple !== undefined) {
      metricsRows.push({ name: `detector: ${detectorKind}`, ...detectorTriple })
    }
  }
  for (const category of benchmarkCategories) {
    const categoryTriple = score.byCategory[category]
    if (categoryTriple !== undefined) {
      metricsRows.push({ name: `category: ${category}`, ...categoryTriple })
    }
  }

  // render the rows
  const metricsRowsHtml = metricsRows.map(
    (metricsRow) => `<tr>
<td>${escapeHtml(metricsRow.name)}</td>
<td class="number">${formatRatio(metricsRow.precision)}</td>
<td class="number">${formatRatio(metricsRow.recall)}</td>
<td class="number">${formatRatio(metricsRow.f1)}</td>
</tr>`,
  )
  return `<table>
<thead><tr><th>Scope</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead>
<tbody>${metricsRowsHtml.join('')}</tbody>
</table>`
}

// render the clean false positives, the cost and the duration of the run
function renderTotals(results: BenchmarkRunResults): string {
  const { score } = results
  return `<dl>
<dt>False positives on clean cases</dt><dd>${score.falsePositivesOnClean}</dd>
<dt>Total cost</dt><dd>${formatCostUsd(score.totalCostUsd)}</dd>
<dt>Total duration</dt><dd>${formatDuration(score.totalDurationMs)}</dd>
</dl>`
}

// render the three selects that filter the per-case table
function renderCaseFilters(): string {
  // render one select per filter with an all option first
  const filterSelects = caseFilters.map((caseFilter) => {
    const valueOptions = caseFilter.values.map(
      (value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`,
    )
    return `<label>${escapeHtml(caseFilter.label)}
<select data-filter="${escapeHtml(caseFilter.attribute)}">
<option value="all">all</option>
${valueOptions.join('\n')}
</select>
</label>`
  })
  return `<div class="filters">${filterSelects.join('\n')}</div>`
}

// render one row per case with the data attributes the filters read
function renderCaseTable(caseDetails: BenchmarkCaseDetail[]): string {
  const caseRows = caseDetails.map(
    (
      caseDetail,
    ) => `<tr data-case="${escapeHtml(caseDetail.caseId)}" data-category="${escapeHtml(caseDetail.category)}" data-split="${escapeHtml(caseDetail.split)}" data-status="${escapeHtml(caseDetail.status)}">
<td>${escapeHtml(caseDetail.caseId)}</td>
<td>${escapeHtml(caseDetail.category)}</td>
<td>${escapeHtml(caseDetail.split)}</td>
<td>${escapeHtml(caseDetail.status)}</td>
<td class="number">${caseDetail.truePositives}</td>
<td class="number">${caseDetail.falsePositives}</td>
<td class="number">${caseDetail.falseNegatives}</td>
<td class="number">${formatCostUsd(caseDetail.costUsd)}</td>
<td class="number">${formatDuration(caseDetail.durationMs)}</td>
<td>${escapeHtml(caseDetail.errorMessage ?? '')}</td>
</tr>`,
  )
  return `<table>
<thead><tr><th>Id</th><th>Category</th><th>Split</th><th>Status</th><th>TP</th><th>FP</th><th>FN</th><th>Cost</th><th>Duration</th><th>Error</th></tr></thead>
<tbody>${caseRows.join('')}</tbody>
</table>`
}

// write a record as key=value pairs, or the empty value marker when it is empty
function formatRecord(record: Record<string, string>): string {
  // an empty record shows the marker
  const entries = Object.entries(record)
  if (entries.length === 0) {
    return emptyValueText
  }

  // join the pairs
  return entries.map(([key, value]) => `${key}=${value}`).join(', ')
}

// write a ratio with three decimals
function formatRatio(ratio: number): string {
  return ratio.toFixed(3)
}

// write a duration in whole milliseconds
function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)} ms`
}
