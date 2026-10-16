# cli Specification

## Purpose
Provides the command-line entry point for the pull request security reviewer. In this change it only prints usage, and later changes add the review, benchmark and server commands to it.

## Requirements

### Requirement: Usage on no arguments
Running the entry point with no arguments SHALL print the program name, a one-line description and the usage text, and exit with status 0.

#### Scenario: No arguments
- **WHEN** `bun index.ts` runs with no arguments
- **THEN** stdout holds the usage text and the exit status is 0

### Requirement: Help flag
Running the entry point with `--help` SHALL print the same usage text and exit with status 0.

#### Scenario: Help flag
- **WHEN** `bun index.ts --help` runs
- **THEN** stdout holds the usage text and the exit status is 0

### Requirement: Unknown command
Running the entry point with a command it does not recognize SHALL print an error naming the command followed by the usage text, and exit non-zero.

#### Scenario: Unknown command
- **WHEN** `bun index.ts frobnicate` runs
- **THEN** stderr names `frobnicate`, the usage text is printed and the exit status is non-zero

### Requirement: Review command
`review <pull request>` SHALL review a GitHub pull request given as a url or `owner/repo#number`, write the report and the audit log under `<out>/<runId>/`, print the report path as a `file://` link and a one-line count summary, and accept `--format html|json` (default html), `--out` (default `runs`), `--fail-on critical|high|medium|low`, `--no-llm`, `--no-cache`, `--offline`, `--model-review`, `--model-summarize` and `--review-prompt-version`.

#### Scenario: Options parse
- **WHEN** `review owner/repo#1 --format json --fail-on high --no-llm --review-prompt-version 2` is parsed
- **THEN** the review runs with json output, fail-on high, the model off and prompt version 2

#### Scenario: Invalid format
- **WHEN** `review owner/repo#1 --format pdf` is parsed
- **THEN** the command exits non-zero naming the allowed formats

### Requirement: Review exit status
The review command SHALL exit 1 when an introduced finding is at or above the `--fail-on` severity, 2 when the run aborted, and 0 otherwise.

#### Scenario: Fail-on met
- **WHEN** a review with `--fail-on high` finds an introduced critical finding
- **THEN** the exit status is 1

#### Scenario: Pre-existing findings do not fail
- **WHEN** the only finding at or above `--fail-on` is pre-existing
- **THEN** the exit status is 0

### Requirement: API keys fail fast
With the model on, the review and benchmark commands SHALL exit before any network call with a message naming `ANTHROPIC_API_KEY` or `FIREWORKS_API_KEY` when the key for a configured model's provider is missing. With `--no-llm` no key SHALL be needed. `GITHUB_TOKEN` SHALL be used when set and never required.

#### Scenario: Missing Anthropic key
- **WHEN** the review model is `anthropic/...` and `ANTHROPIC_API_KEY` is unset
- **THEN** the command fails with a message naming `ANTHROPIC_API_KEY`

### Requirement: Benchmark commands
`benchmark run --split dev|test|all --label <name> [--review-prompt-version n]` SHALL run the pipeline over the split and write the results files, with `all` running dev then test. The live code-review prompt version SHALL come from `reviewPromptVersion` in `config/review.json`, and the flag SHALL override it for that run only. `benchmark show` SHALL print the latest metrics of each split.

#### Scenario: Prompt version override
- **WHEN** `benchmark run --split dev --label trial --review-prompt-version 3` is parsed
- **THEN** the run uses code-review prompt version 3 and the configuration file is unchanged

### Requirement: Matcher validation command
`validate-matcher` SHALL compare the hand-written matcher with osv-scanner over every committed lockfile, print the report and exit with the validation's status.

#### Scenario: Status passes through
- **WHEN** the validation finds a disagreement that is not accepted
- **THEN** the command prints the report and exits non-zero

### Requirement: Benchmark advisories are the corpus advisories
`benchmark run` SHALL match dependencies against the advisory fixture the corpus labels are checked against.

#### Scenario: A labeled advisory outside the committed subset
- **WHEN** the dev split runs and a case is labeled with an advisory only the corpus fixture holds
- **THEN** the pipeline can report that advisory

### Requirement: Terminal output is safe
Every text the CLI prints that comes from a pull request, a model or a file SHALL have its control characters removed, except newline and tab.

#### Scenario: Escape sequence in a title
- **WHEN** a printed value holds an ANSI escape sequence
- **THEN** the escape character is not printed
