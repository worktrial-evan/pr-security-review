# Tasks

## 1. Fixture

- [x] 1.1 Write `src/report/fixtures/review-result.ts` exporting a `ReviewResult` with at least 25 findings, covering every detector, severity, dependency scope, reachability kind, matcher agreement and summary source, both boolean values of GitHub reviewed and of introduced, one step error, and verify `src/report/fixtures/review-result.test.ts` passes: it parses the fixture through `reviewResultSchema` and checks every enum tuple value appears

## 2. Row model and filter and sort

- [x] 2.1 Write `src/report/html-escape.ts` with `escapeHtml` and a safe-link helper that links only `https` urls, and verify `bun test src/report/html-escape.test.ts` covers quotes, angle brackets, ampersands and a `javascript:` url shown as text
- [x] 2.2 Write `src/report/report-rows.ts` with `toReportRows` giving one flat row per finding and null where a column does not apply, and verify `bun test src/report/report-rows.test.ts` covers one row per detector with null in the columns that do not apply
- [x] 2.3 Write `src/report/filter-sort.ts` with the pure `selectRows` (AND filters, empty selection is no filter, sca-only filters hide other detectors, severity by rank, nulls last in both directions, stable ties), and verify `bun test src/report/filter-sort.test.ts` covers each of those, plus a test that evaluates `selectRows.toString()` with `new Function` and gets the same result as the import

## 3. HTML report

- [x] 3.1 Write `src/report/page-style.ts` and `src/report/page-script.ts` (inline CSS with the muted row style, and the script that embeds `selectRows` by source, wires filters, header sorting and row expansion), and verify `bun check src/report` passes
- [x] 3.2 Write `src/report/render-html.ts` with `renderHtmlReport`: header with counts that exclude pre-existing findings, the pre-existing versus introduced line, the table with every column, filter controls, expandable detail rows, and verify `bun test src/report/render-html.test.ts` covers header values, a dash for a missing snapshot, counts of 3 introduced and 2 pre-existing, every fixture finding id present, a muted pre-existing row, escaped titles and no external url in any `src`, `href` to a stylesheet or `@import`
- [x] 3.3 Add `src/report/tag-balance.ts` as a test helper and verify `bun test src/report/render-html.test.ts` also passes the fixture report through it, and that the helper rejects an unclosed tag and a mismatched close in `src/report/tag-balance.test.ts`

## 4. JSON report and fixture report

- [x] 4.1 Write `src/report/render-json.ts` with `renderJsonReport` and verify `bun test src/report/render-json.test.ts` covers the fixture round trip through the schema and a throw for a confidence of 1.5
- [x] 4.2 Write `src/report/fixtures/write-fixture-report.ts` that writes `runs/fixture-report.html` and `runs/fixture-report.json`, and verify `bun src/report/fixtures/write-fixture-report.ts` exits 0 and `bun run check:headers` passes
- [x] 4.3 Open `runs/fixture-report.html` in a browser and verify the filters combine, the rows shown against total count updates, each header sorts both ways, severity sorts by rank and a row expands

## 5. Final verification

- [x] 5.1 bun run verify passes
- [x] 5.2 module AGENTS.md updated

## Workflow follow-up

- Stage each file as it is finished.
- The session instruction pre-approves one commit when `bun run verify` passes. `openspec/config.yaml` says to commit only after archive, so the single commit is made at the end of apply and the archive stays with the user.
- Never push, merge or archive.
