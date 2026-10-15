# Design

## Context

`src/report` may import only `src/shared`, so everything here works from a `ReviewResult` and never from the pipeline. The `finding` contract is a three-way union, and the sca, code-review and secrets variants have different fields. See proposal.md for the decisions on open details.

## Goals / Non-Goals

**Goals:**
- One function for filter and sort, used identically by the tests and by the page.
- Output that is deterministic for a given result, so the HTML can be compared in tests.

**Non-Goals:**
- A general HTML templating layer, client-side state in the URL, or print styling.

## Decisions

### D1. A flat row model feeds both the table and the script
`toReportRows(findings)` maps each finding to a flat row: one value per column or a null where the column does not apply. The server-side table renders from the rows, and the same rows are embedded in the page as JSON. Alternative was reading values back out of the DOM in the script. Rejected because the row model is then tested without a browser.

### D2. The filter and sort function is embedded by its source text
`selectRows` in `filter-sort.ts` is a pure function that, with its small helper functions in the same file, has no free variables, no imports and no outer constants, taking the severity order through its options. The page embeds the source text of those functions and calls `selectRows`. A test evaluates the embedded text with `new Function` and checks it returns what the imported function returns. Alternative was a hand-written copy of the logic in the page script. Rejected because the copy would drift from the tested code.

### D3. The script only reorders and hides
Every row, with its detail row, is rendered on the server, so every finding id is in the HTML without running script. The script calls `selectRows`, then sets `hidden` on rows and re-appends row pairs in the returned order. Alternative was rendering the table in the browser from JSON. Rejected because a report with scripting off would then be empty.

### D4. Sorting rules
Values compare as numbers when both are numbers, otherwise as strings, and severity compares by its rank index. Rows with a null in the sorted column go last in both directions, so toggling to descending does not float dashes to the top. The sort is stable and ties keep the original order.

### D5. Escaping and embedding
Every interpolated value passes through one `escapeHtml`. The embedded JSON replaces `<` with `<`, so no value can close the script element. Links get `rel="noreferrer"` and only `https` urls are linked, other values are shown as text.

### D6. File layout
`render-html.ts` assembles the page. `report-rows.ts`, `filter-sort.ts`, `html-escape.ts`, `page-style.ts` and `page-script.ts` each hold one concern, and `render-json.ts` is the JSON renderer. `fixtures/review-result.ts` is the fixture and `fixtures/write-fixture-report.ts` writes it to `runs/fixture-report.html`. `runs/` is already gitignored and excluded from the biome check.

### D7. Tag-balance check for the tests
A test helper walks the HTML with a tag regex and a stack, skips void elements and the contents of `script` and `style`, and fails on a mismatched or unclosed tag. Alternative was adding a parser dependency. Rejected because dependencies are frozen.

## Risks / Trade-offs

- [`toString()` output depends on how Bun transpiles the function] → The embed test runs the emitted text, so a transpile change fails a test instead of the page.
- [The fixture drifts from the contract] → The fixture is checked with `reviewResultSchema` and an enum coverage test built from the exported tuples, so a new enum value fails the test until the fixture covers it.
- [Advisory references are only links built from ids] → Recorded in the proposal. A later change that adds a references field to `src/shared` can replace the links.
