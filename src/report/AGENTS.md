# report module

## Purpose

renders findings and metadata into the review report: a self-contained interactive HTML report for people and a validated JSON report for CI

## Public API

- `renderHtmlReport(result)`: returns one HTML string for a `ReviewResult`, with inline CSS and vanilla JavaScript and no external request
- `renderJsonReport(result)`: validates a `ReviewResult` through `reviewResultSchema` and returns it as indented JSON. Throws when it does not validate
- `selectRows({ rows, selections, sort, severityOrder })`: the pure filter and sort function. Returns the ids of the rows that pass every filter, in sorted order
- `getFilterSortSource()`: returns the source text of `selectRows` and its helpers, which the page embeds and runs
- `toReportRows(findings)`, `toReportRow(finding)`: flatten findings into rows with one value per column and null where a column does not apply
- `columnKeys`, `ColumnKey`, `CellValue`, `ReportRow`: the table columns and row shape
- `escapeHtml(text)`, `renderLink({ url, label })`: escape text, and link only https urls
- `fixtureReviewResult`, in `fixtures/review-result.ts`: a valid `ReviewResult` with 27 findings for the tests and the README screenshot
- `writeFixtureReport()`: writes the fixture as `runs/fixture-report.html` and `runs/fixture-report.json`

## Inputs and outputs

Both renderers take a `ReviewResult` and return a string. They read no file, make no request and keep no state. `writeFixtureReport` is the only code that writes a file, and only into the gitignored `runs/` folder. Open `runs/fixture-report.html` in a browser to try the filters and sorting.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `render-html.ts`: assembles the page and embeds the row data as JSON that cannot close its script element
- `render-header.ts`: the run details with the suspected prompt injection count, the counts of introduced findings and the pre-existing versus introduced line
- `render-table.ts`: the filter controls, the table header with sort buttons, the finding rows and their hidden detail rows
- `render-detail.ts`: the expanded detail of a finding and the advisory links
- `report-rows.ts`: the column list and the finding-to-row mapping
- `report-format.ts`: the empty value marker and the cost, duration and confidence formats
- `filter-sort.ts`: `selectRows` and its helpers, and `getFilterSortSource`
- `page-script.ts`: the page script, which is the embedded filter and sort source plus the code that wires filters, sort buttons and row expansion
- `page-style.ts`: the inline CSS, light and dark
- `html-escape.ts`: `escapeHtml` and `renderLink`
- `render-json.ts`: the JSON report
- `tag-balance.ts`: a tag-balance check used by the tests as a well-formedness check
- `fixtures/dependency-findings.ts`, `fixtures/code-review-findings.ts`, `fixtures/secret-findings.ts`: the fixture findings of each detector
- `fixtures/review-result.ts`: the fixture review result built from them
- `fixtures/write-fixture-report.ts`: the script that writes the fixture reports
- `*.test.ts`: one test file beside each source file above, and `fixtures/review-result.test.ts`
- `tsconfig.json`: the module's composite TypeScript project. It references only `shared`
- `AGENTS.md`: this file

## Invariants

- Everything on the page comes from the `ReviewResult`. Every interpolated value passes through `escapeHtml`, and embedded JSON escapes `<`.
- The page makes no external request. Links are plain anchors and only https urls are linked.
- Every finding has a table row and a hidden detail row on the server, so the report is complete without running script.
- `selectRows` and its helpers use nothing defined outside `filter-sort.ts`, because the page runs them from source text. `filter-sort.test.ts` runs the embedded text and compares it with the imported function.
- Filters combine with AND. A row with no value in a filtered column never matches a selection. Rows with no value in the sorted column come last in both directions, and rows that tie keep their original order.
- Headline counts include only findings introduced by the pull request. Pre-existing findings are muted and counted only on the pre-existing versus introduced line.
- The fixture covers every value of every enum, and `fixtures/review-result.test.ts` fails when a new enum value is not covered.

## How to test

`bun test src/report` runs the module's tests. `bun check src/report` type-checks it and `bunx biome check src/report` lints it. `bun src/report/fixtures/write-fixture-report.ts` writes the fixture report to `runs/` for a manual check in a browser.

## Known gaps

- SARIF output is not implemented. A later change adds it to this module.
- The server is not implemented. This module only returns strings.
- The pull request reference has no title, so the header links `owner/repository#number`. The contract has no advisory reference urls, so the detail row links the advisory id and aliases to osv.dev and lists the fixed versions.
- Step errors and degraded steps in the result are not shown in the HTML report. They are in the JSON report.
- The page wiring for filters, sorting and expansion has no automated DOM test. It was checked by hand in a browser against the fixture report. The logic it calls is unit tested.
- Filter and sort choices are not kept across a reload.
- The README screenshot is not taken yet.
