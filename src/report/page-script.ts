// builds the inline script of the report page: the embedded filter and sort source plus the code that wires the page to it
import { getFilterSortSource } from './filter-sort'

// the code that reads the embedded rows, wires filters, sort buttons and row expansion, and redraws the table
const pageWiringSource = `
(function () {
  // read the rows and the severity order the server embedded
  const data = JSON.parse(document.getElementById('report-data').textContent)
  const tableBody = document.querySelector('#findings tbody')

  // pair each finding row with its detail row
  const rowPairs = new Map()
  for (const row of tableBody.querySelectorAll('tr.finding')) {
    const findingId = row.dataset.findingId
    const detail = tableBody.querySelector('tr.detail[data-detail-for="' + findingId + '"]')
    rowPairs.set(findingId, { row: row, detail: detail })
  }

  // the filters and sort the reader has chosen
  const selections = {}
  let sort = null

  // choose the visible rows, then hide the others and put the visible ones in order
  function refresh() {
    const visibleIds = selectRows({
      rows: data.rows,
      selections: selections,
      sort: sort,
      severityOrder: data.severityOrder,
    })
    const visibleIdSet = new Set(visibleIds)
    const hiddenIds = Array.from(rowPairs.keys()).filter(function (id) {
      return !visibleIdSet.has(id)
    })

    // hide a filtered row with its detail and keep an open detail open
    for (const id of visibleIds.concat(hiddenIds)) {
      const pair = rowPairs.get(id)
      const isVisible = visibleIdSet.has(id)
      const isExpanded = pair.row.getAttribute('aria-expanded') === 'true'
      pair.row.hidden = !isVisible
      pair.detail.hidden = !isVisible || !isExpanded
      tableBody.append(pair.row, pair.detail)
    }

    // show the counts and the sort direction
    document.getElementById('rows-shown').textContent = String(visibleIds.length)
    for (const header of document.querySelectorAll('#findings th[data-column]')) {
      const isSorted = sort !== null && sort.column === header.dataset.column
      header.setAttribute('aria-sort', isSorted ? sort.direction : 'none')
    }
  }

  // refresh when a checkbox changes and show how many values are selected
  for (const filter of document.querySelectorAll('details.filter')) {
    const summary = filter.querySelector('summary')
    filter.addEventListener('change', function () {
      const checkedInputs = filter.querySelectorAll('input:checked')
      const checkedValues = Array.from(checkedInputs).map(function (input) {
        return input.value
      })
      selections[filter.dataset.filter] = checkedValues
      const suffix = checkedValues.length > 0 ? ' (' + checkedValues.length + ')' : ''
      summary.textContent = summary.dataset.label + suffix
      refresh()
    })
  }

  // sort ascending on the first click of a header and flip the direction on the next
  for (const header of document.querySelectorAll('#findings th[data-column]')) {
    header.querySelector('button').addEventListener('click', function () {
      const column = header.dataset.column
      const isSameColumn = sort !== null && sort.column === column
      const isAscending = isSameColumn && sort.direction === 'ascending'
      sort = { column: column, direction: isAscending ? 'descending' : 'ascending' }
      refresh()
    })
  }

  // open or close the detail of a row
  function toggleRow(row) {
    const isExpanded = row.getAttribute('aria-expanded') === 'true'
    row.setAttribute('aria-expanded', String(!isExpanded))
    rowPairs.get(row.dataset.findingId).detail.hidden = isExpanded
  }

  // expand a row on click, except when the click is on a link
  tableBody.addEventListener('click', function (event) {
    if (event.target.closest('a')) {
      return
    }
    const row = event.target.closest('tr.finding')
    if (row) {
      toggleRow(row)
    }
  })

  // expand a focused row on enter or space
  tableBody.addEventListener('keydown', function (event) {
    const isActivationKey = event.key === 'Enter' || event.key === ' '
    if (isActivationKey && event.target.matches('tr.finding')) {
      event.preventDefault()
      toggleRow(event.target)
    }
  })

  refresh()
})()
`

/**
 * Builds the page script: the filter and sort functions as source text followed by the page wiring.
 */
export function buildPageScript(): string {
  return `${getFilterSortSource()}\n${pageWiringSource}`
}
