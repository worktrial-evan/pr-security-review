// renders a ReviewResult as one self-contained HTML page with inline CSS and vanilla JavaScript
import { severities } from '../shared/finding'
import type { ReviewResult } from '../shared/review'
import { escapeHtml } from './html-escape'
import { buildPageScript } from './page-script'
import { pageStyle } from './page-style'
import { renderHeader } from './render-header'
import { renderFilters, renderTable } from './render-table'
import { toReportRows } from './report-rows'

/**
 * Renders a review result as a single HTML string with no external requests.
 */
export function renderHtmlReport(result: ReviewResult): string {
  // build the table rows and the data the page script reads
  const rows = toReportRows(result.findings)
  const embeddedData = serializeEmbeddedJson({
    rows,
    severityOrder: [...severities],
  })

  // build the visible sections
  const headerHtml = renderHeader(result)
  const filtersHtml = renderFilters(result.findings.length)
  const tableHtml = renderTable(result.findings)

  // assemble the document
  const title = `Security review ${escapeHtml(result.metadata.runId)}`
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<style>${pageStyle}</style>`,
    '</head>',
    '<body>',
    headerHtml,
    '<main>',
    filtersHtml,
    tableHtml,
    '</main>',
    `<script type="application/json" id="report-data">${embeddedData}</script>`,
    `<script>${buildPageScript()}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
}

// serialize a value as JSON that cannot close the script element it sits in
function serializeEmbeddedJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
