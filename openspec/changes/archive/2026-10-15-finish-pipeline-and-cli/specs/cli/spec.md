# Spec Delta

## MODIFIED Requirements

### Requirement: Review command
`review [pull request]` SHALL review a GitHub pull request given as a url or `owner/repository#number`, write the report and the audit log under the run directory, print the report path as a `file://` link and a one-line count summary, and accept `--format html|json` (default html), `--out <directory>` naming the run directory (default `runs/<runId>`), `--fail-on critical|high|medium|low`, `--no-llm`, `--no-cache`, `--offline`, `--model-review`, `--model-summarize` and `--review-prompt-version`.

#### Scenario: Options parse
- **WHEN** `review owner/repository#1 --format json --fail-on high --no-llm --review-prompt-version 2` is parsed
- **THEN** the review runs with json output, fail-on high, the model off and prompt version 2

#### Scenario: Invalid format
- **WHEN** `review owner/repository#1 --format pdf` is parsed
- **THEN** the command exits non-zero naming the allowed formats

#### Scenario: Default run directory
- **WHEN** `review owner/repository#1` runs without `--out`
- **THEN** the report and `audit.jsonl` are written under `runs/<runId>/`

#### Scenario: Explicit run directory
- **WHEN** `review owner/repository#1 --out reports/one` runs
- **THEN** the report and `audit.jsonl` are written directly under `reports/one/`

### Requirement: Terminal output is safe
Every text any command prints SHALL have its control characters removed, except newline and tab. This covers the report path and counts, error messages, the benchmark metrics and warnings, and the refresh-advisories summary.

#### Scenario: Escape sequence in a title
- **WHEN** a printed value holds an ANSI escape sequence
- **THEN** the escape character is not printed

#### Scenario: Warning from git
- **WHEN** the benchmark skips a case and git's stderr holds an escape sequence
- **THEN** the warning is printed without the escape character

## ADDED Requirements

### Requirement: Local repository review
`review --repo <path> --base <sha> --head <sha>` SHALL review the two commits of a local repository without any GitHub call or token. The three options SHALL be accepted only together and only without the pull request argument.

#### Scenario: Local form runs
- **WHEN** `review --repo /tmp/project --base <sha> --head <sha> --no-llm` runs over a repository holding both commits
- **THEN** the report is written and the result's description has no pull request reference

#### Scenario: Mixed forms are refused
- **WHEN** `review owner/repository#1 --repo /tmp/project` is parsed
- **THEN** the command exits non-zero naming the rule

#### Scenario: Incomplete local form is refused
- **WHEN** `review --repo /tmp/project --base <sha>` is parsed without `--head`
- **THEN** the command exits non-zero naming the missing option

### Requirement: Cancellation by signal
On SIGINT or SIGTERM, `review` and `benchmark run` SHALL move the run state to failed with the error `cancelled by <signal name>`, write a final audit event of kind `note` whose payload holds `status: cancelled`, the signal and the stage reached, flush it, dispose the pull request source so its temporary worktree is removed, and exit with 128 plus the signal number.

#### Scenario: Control-C during a review
- **WHEN** SIGINT arrives while a review step is running
- **THEN** the last line of `audit.jsonl` is the cancelled note naming SIGINT and the stage, the head worktree is gone, no report is written and the exit status is 130

#### Scenario: SIGTERM during a benchmark run
- **WHEN** SIGTERM arrives while a benchmark case is running
- **THEN** that case's log ends with the cancelled note, no results file is written and the exit status is 143

### Requirement: Escaped errors exit 2
An error that a command lets escape SHALL be printed as one line through the sanitized output and the command SHALL exit 2.

#### Scenario: Model id without a provider
- **WHEN** `review owner/repository#1 --model-review sonnet` runs
- **THEN** stderr holds one line naming the problem, no stack trace, and the exit status is 2

### Requirement: The token reaches every clone
When `GITHUB_TOKEN` is set, `benchmark run` SHALL pass it to the clones of its git-backed cases.

#### Scenario: Token on a benchmark clone
- **WHEN** `benchmark run` clones a case repository with `GITHUB_TOKEN` set
- **THEN** git receives the token as an authorization header for github.com and never on its command line
