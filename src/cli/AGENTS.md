# cli module

## Purpose

The command-line interface: parses `review`, `benchmark run`, `benchmark show`, `refresh-advisories` and `validate-matcher` into typed options and runs them against the pipeline, the benchmark and the advisories.

## Public API

### program.ts

- `runCli({ commandArguments, handlers, output })`: parses the arguments, runs the matching handler and returns the exit status. No arguments prints the help to stdout with status 0, and an unknown command prints `unknown command '<name>'` and the help to stderr with status 1
- `CliHandlers`: `review`, `benchmarkRun`, `benchmarkShow`, `refreshAdvisories` and `validateMatcher`, each returning the exit status
- `ReviewCommandOptions`, `BenchmarkRunCommandOptions`, `RunCliOptions`: the parsed options and the runner options
- `reportFormats`, `ReportFormat`, `failOnSeverities`, `benchmarkRunSplits`, `BenchmarkRunSplit`: the values the flags accept

### cli-handlers.ts

- `createCliHandlers(output)`: the real handlers, reading `process.env`

### review-command.ts

- `runReviewCommand({ commandOptions, environment, output, openPullRequestSource })`: loads the settings with the flags applied, fails with status 2 naming the missing api key before any network call, opens the pull request, runs `runReview` with the run's audit log, writes `<out>/<runId>/report.html` or `report.json`, prints the report as a `file://` link and the count line, and returns the exit status
- `OpenPullRequestSource`, `OpenPullRequestSourceOptions`, `RunReviewCommandOptions`: the opener tests replace and the command options. The default opener clones the pull request into `<cache>/pull-request-repositories` with `GITHUB_TOKEN` when it is set

### benchmark-command.ts

- `runBenchmarkCommand({ commandOptions, environment, output })`: writes the corpus advisory cache into a temporary directory, runs the dev split, the test split or both under one label against it and prints one metrics line per split
- `writeCorpusAdvisoryCache(cacheDirectory)`: indexes `benchmark/fixtures/advisories/advisories.json`, the 35 advisories the corpus labels are checked against, into the advisory store layout with the fixture's snapshot
- `createBenchmarkPipeline({ runSettings, runsDirectory })`: the per-case pipeline, `runReview` with its own audit log under `runs/` that throws on an aborted run so the runner records a failed case
- `runBenchmarkShowCommand({ output, resultsDirectory })`: prints the metrics line of `latest-dev.json` and `latest-test.json`, says when a split has none, and returns 1 when one does not parse
- `formatMetricsLine(results)`: split, label, f1, precision, recall, clean false positives, cost, case count and finish time
- `RunBenchmarkCommandOptions`, `CreateBenchmarkPipelineOptions`, `RunBenchmarkShowCommandOptions`: their options

### validate-matcher-command.ts

- `runValidateMatcherCommand({ output, scriptPath })`: runs `scripts/validate-matcher.ts` from the repository root under the same bun, writes its stdout and stderr through the output and returns its exit status
- `validateMatcherScriptPath`, `RunValidateMatcherCommandOptions`: the script and the options

### review-outcome.ts

- `decideReviewExitCode(reviewResult, failOnSeverity)`: 2 for an aborted run, 1 when an introduced finding is at or above the fail-on severity, 0 otherwise
- `hasFindingAtOrAbove({ findings, failOnSeverity })`, `HasFindingAtOrAboveOptions`: the fail-on check. Pre-existing findings never count
- `formatReviewSummary(reviewResult)`: introduced findings by severity, pre-existing findings, errors and degraded steps on one line
- `reviewExitCodes`: passed 0, fail-on met 1, aborted 2

### terminal-text.ts

- `toTerminalText(text)`: the text without control characters other than newline and tab
- `CliOutput`, `createProcessOutput()`: where the cli writes, and the output that sanitizes everything before it reaches stdout or stderr

## Inputs and outputs

Reads the command arguments, `process.env` for `ANTHROPIC_API_KEY`, `FIREWORKS_API_KEY` and `GITHUB_TOKEN`, `config/review.json` and `config/models.json` through the pipeline, and `benchmark/results/latest-<split>.json`. A review writes `<out>/<runId>/audit.jsonl` and the report beside it. A benchmark run writes the runner's results files and one audit log per case under `runs/`, and removes its temporary advisory cache. `validate-matcher` spawns the script, which needs osv-scanner on PATH. Everything printed goes through `toTerminalText`.

The flags of `review`: `--format html|json` (default html), `--out <directory>` (default `runs`), `--fail-on critical|high|medium|low`, `--no-llm`, `--no-cache`, `--offline`, `--model-review <model-id>`, `--model-summarize <model-id>`, `--review-prompt-version <n>`. The flags of `benchmark run`: `--split dev|test|all` and `--label <name>`, both required, `--review-prompt-version <n>`, `--no-llm`, `--no-cache`.

## Allowed imports

shared, pipeline, report, benchmark, harness, server, advisories, matcher, pull-request-source

Bun and Node built-ins and npm packages are always allowed.

## Files

- `program.ts`: the commander program, the commands and their flags, and `runCli`
- `program.test.ts`: review defaults and every flag, validate-matcher, the handler's exit status, a rejected format, fail-on and prompt version, the required argument, benchmark run flags and required options, help and an unknown command
- `cli-handlers.ts`: the real handlers
- `review-command.ts`: the review command
- `review-command.test.ts`: over a snapshot pull request with the llm off: the html report and a redacted audit log on disk with the link and summary printed, a json report with fail-on met, a missing key failing before the pull request is opened, and an unparseable reference
- `benchmark-command.ts`: the benchmark run and show commands and the per-case pipeline
- `benchmark-command.test.ts`: show with results, with none and with a broken file, the per-case pipeline writing its audit log and throwing on an aborted run, the dependency-01 case reviewed against the corpus advisory cache with one introduced `ms` finding across both lockfiles, and agreement with osv-scanner when it is installed
- `validate-matcher-command.ts`: the validate-matcher command
- `validate-matcher-command.test.ts`: a stand-in script's two streams and exit status passed through
- `review-outcome.ts`: the exit status, the fail-on check and the summary line
- `review-outcome.test.ts`: fail-on with introduced and pre-existing findings, the aborted status and the summary line
- `terminal-text.ts`: the sanitizer and the process output
- `terminal-text.test.ts`: an ANSI escape, other control characters, and newlines and tabs kept
- `tsconfig.json`: the module's composite TypeScript project, referencing its row of the matrix
- `AGENTS.md`: this file

The root `index.ts` runs `runCli` with `createCliHandlers` and `createProcessOutput` and sets the process exit code. `index.test.ts` spawns it.

## Invariants

- Every byte the cli writes passes through `toTerminalText`, commander's own help and errors included.
- A missing api key for a configured model stops the command before any network call. `--no-llm` needs no key. `GITHUB_TOKEN` is used when set and never required.
- The code-review prompt version of a run is the flag when given and `reviewPromptVersion` in `config/review.json` otherwise. The flag never writes the config.
- Only introduced findings decide the fail-on exit status.

## How to test

`bun test src/cli index.test.ts` runs every test offline. The review command test replaces the clone with a snapshot source and points `PULL_REQUEST_REVIEW_CACHE_DIR` at a temporary directory. `bun check src/cli/program.ts` type-checks the module and `bunx biome check src/cli` lints it.

## Known gaps

- `validate-matcher` prints the script's output only once the script ends.
- The review command reads GitHub pull requests only. A local repository or snapshot needs `runReviewCommand` with its own opener.
- `benchmark run` always writes per-case audit logs under `runs/` in the working directory.
- The review command has no live test against GitHub or a model.
