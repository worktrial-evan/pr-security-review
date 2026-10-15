# Proposal

## Why

The pipeline will produce a `ReviewResult` that nobody can read or gate CI on until it is rendered. The report module can be built now against the frozen `ReviewResult` contract and fixture data, in parallel with the detectors.

## What Changes

- Add `renderHtmlReport(result)`: one self-contained HTML string with a metadata header, a findings table with multiselect filters and sortable columns, and expandable rows.
- Add `renderJsonReport(result)`: the result validated through `reviewResultSchema` and serialized for CI.
- Add a pure filter and sort function that is unit tested and embedded into the page as source text, so the page and the tests run the same code.
- Add a fixture `ReviewResult` with at least 25 findings that covers every detector and every enum value, and a script that writes the fixture report to `runs/` for opening in a browser.

## Decisions for open details

- Pre-existing findings are the ones with `isIntroducedByPullRequest` false. They are muted, excluded from the severity and detector counts, and counted only on the pre-existing versus introduced line.
- The contract has no advisory reference URLs. The expanded row shows the advisory id and its aliases as `osv.dev` links, plus fixed versions. Adding a references field would change `src/shared`.
- A filter on an sca-only column hides rows of other detectors once any value is selected, because those rows show a dash.
- The pull request reference has no title field. The header shows `owner/repo#number` linked to the pull request url in its place.
- Duration is `finishedAt` minus `startedAt`. A missing pull request reference or advisory snapshot renders as a dash.
- There is no HTML parser dependency, so the well-formedness check is a small tag-balance checker in the tests.
- The README screenshot is taken by hand from the fixture report. `README.md` is frozen and is not edited here.

## Capabilities

### New Capabilities
- `review-report`: rendering a `ReviewResult` as a self-contained interactive HTML report and as a validated JSON report.

### Modified Capabilities

## Impact

- New code and tests in `src/report` and `src/report/fixtures`, and `src/report/AGENTS.md`.
- Imports only `src/shared`, as the matrix allows. No dependency, config or shared contract changes.
- Out of scope: SARIF output and the server.
