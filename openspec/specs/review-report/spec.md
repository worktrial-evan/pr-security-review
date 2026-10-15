# review-report Specification

## Purpose
Turns a ReviewResult into a self-contained interactive HTML report for people and a validated JSON report for CI, so a review can be read and gated on without the pipeline that produced it.

## Requirements

### Requirement: Self-contained HTML document
The HTML renderer SHALL return one well-formed HTML string with inline CSS and vanilla JavaScript, and the page SHALL make no external request and use no framework.

#### Scenario: No external resources
- **WHEN** a result is rendered
- **THEN** the HTML has no script, stylesheet, image or font reference that points to a URL

#### Scenario: Well-formed output
- **WHEN** the fixture result is rendered
- **THEN** every opened tag is closed in order

### Requirement: Run header
The report header SHALL show when the run started, the pull request url and title, the base and head sha, the run id, the duration, the total cost in USD, the advisory snapshot date, each prompt id with its version, each model id, and a dash for any value the result does not have.

#### Scenario: Header values
- **WHEN** the fixture result is rendered
- **THEN** the header contains its run id, both shas, its cost, every prompt id with its version and every model id

#### Scenario: Missing snapshot
- **WHEN** a result has no advisory snapshot
- **THEN** the snapshot date shows a dash

### Requirement: Headline counts exclude pre-existing findings
The header SHALL show finding counts by severity and by detector that include only findings introduced by the pull request, and one line giving how many findings are pre-existing and how many are introduced.

#### Scenario: Counts
- **WHEN** a result has 3 introduced high findings and 2 pre-existing high findings
- **THEN** the high count is 3 and the line reports 2 pre-existing and 3 introduced

### Requirement: Every finding appears in the table
The table SHALL have one row per finding with the columns severity, detector, title, file and lines, package and version, advisory id with alias links, GitHub reviewed, dependency scope, reachability, matcher agreement, CWE, confidence and introduced by pull request, and a column that does not apply to the finding's detector SHALL show a dash.

#### Scenario: All ids present
- **WHEN** the fixture result is rendered
- **THEN** every finding id appears in the HTML

#### Scenario: Dash for a column that does not apply
- **WHEN** a secrets finding is rendered
- **THEN** its package, advisory, dependency scope, reachability, matcher agreement and CWE cells show a dash

### Requirement: Pre-existing findings are muted
A finding that the pull request did not introduce SHALL be visibly muted in the table.

#### Scenario: Muted row
- **WHEN** a pre-existing finding is rendered
- **THEN** its row carries the muted style and an introduced finding's row does not

### Requirement: Expandable row detail
Activating a row SHALL expand it to show the summary, remediation, evidence lines, dependency path, importing files and advisory links of that finding, with a dash for each part the finding does not have.

#### Scenario: Expand a code review finding
- **WHEN** a code review finding's row is expanded
- **THEN** its summary, remediation and evidence lines are shown

### Requirement: Multiselect filters
The report SHALL offer multiselect filters for detector, severity, dependency scope, GitHub reviewed, reachability, matcher agreement and introduced by pull request, combine them with AND, treat an empty selection as no filter, and show the rows shown against the total rows.

#### Scenario: Filters combine
- **WHEN** the detector filter selects sca and the severity filter selects high
- **THEN** only sca findings of high severity are shown and the count reads shown of total

#### Scenario: Several values in one filter
- **WHEN** the severity filter selects high and critical
- **THEN** findings of either severity are shown

#### Scenario: Sca-only filter hides other detectors
- **WHEN** the reachability filter selects transitive
- **THEN** code review and secrets findings are hidden

### Requirement: Sortable columns
Each column header SHALL sort the rows ascending on the first activation and descending on the next, severity SHALL sort by rank from critical to info and not alphabetically, and rows with a dash in the sorted column SHALL come last in both directions.

#### Scenario: Severity rank
- **WHEN** the severity column is sorted ascending
- **THEN** critical findings come before high, medium, low and info

#### Scenario: Toggle direction
- **WHEN** the same header is activated twice
- **THEN** the second order is the reverse of the first, apart from rows with a dash

### Requirement: Validated JSON report
The JSON renderer SHALL return the ReviewResult as a JSON string after validating it through the review result schema, and SHALL throw instead of returning when the result does not validate.

#### Scenario: Round trip
- **WHEN** the fixture result is rendered as JSON and parsed through the schema
- **THEN** the parsed value equals the fixture result

#### Scenario: Invalid result
- **WHEN** a result with a confidence of 1.5 is rendered as JSON
- **THEN** the call throws

### Requirement: Fixture result
The module SHALL provide a fixture ReviewResult with at least 25 findings that covers every detector, severity, dependency scope, reachability kind, matcher agreement and summary source, both values of GitHub reviewed and of introduced by pull request, at least one step error, and that validates through the review result schema.

#### Scenario: Fixture coverage
- **WHEN** the fixture findings are grouped by each enum field
- **THEN** every value of every enum appears at least once
