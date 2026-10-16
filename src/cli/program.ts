// builds the commander program. it parses every command into typed options for the handlers
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from 'commander'
import type { Severity } from '@/shared/finding'
import type { CliOutput } from './terminal-text'

// the report formats the review command writes
export const reportFormats = ['html', 'json'] as const
export type ReportFormat = (typeof reportFormats)[number]

// the severities --fail-on accepts
export const failOnSeverities = [
  'critical',
  'high',
  'medium',
  'low',
] as const satisfies readonly Severity[]

// the splits benchmark run accepts. all runs dev then test
export const benchmarkRunSplits = ['dev', 'test', 'all'] as const
export type BenchmarkRunSplit = (typeof benchmarkRunSplits)[number]

// the parsed options of review
export interface ReviewCommandOptions {
  pullRequest: string
  format: ReportFormat
  outDirectory: string
  failOnSeverity: Severity | undefined
  isLlmEnabled: boolean
  isCacheEnabled: boolean
  isOffline: boolean
  reviewModelId: string | undefined
  summarizeModelId: string | undefined
  reviewPromptVersion: string | undefined
}

// the parsed options of benchmark run
export interface BenchmarkRunCommandOptions {
  split: BenchmarkRunSplit
  label: string
  isLlmEnabled: boolean
  isCacheEnabled: boolean
  reviewPromptVersion: string | undefined
}

// what each command does once its options are parsed. each returns the exit status
export interface CliHandlers {
  review(options: ReviewCommandOptions): Promise<number>
  benchmarkRun(options: BenchmarkRunCommandOptions): Promise<number>
  benchmarkShow(): Promise<number>
  refreshAdvisories(): Promise<number>
  validateMatcher(): Promise<number>
}

// the arguments to parse and the handlers to call and where to write
export interface RunCliOptions {
  commandArguments: string[]
  handlers: CliHandlers
  output: CliOutput
}

/**
 * Parses the command arguments, runs the matching handler and returns the exit status.
 */
export async function runCli({
  commandArguments,
  handlers,
  output,
}: RunCliOptions): Promise<number> {
  // let the handler that runs set the exit status
  let exitCode = 0
  const program = createProgram({
    handlers,
    output,
    setExitCode: (handlerExitCode) => {
      exitCode = handlerExitCode
    },
  })

  // print help for no command. turn commander's own exits such as help and parse errors into a status
  const argumentsToParse =
    commandArguments.length === 0 ? ['--help'] : commandArguments
  try {
    await program.parseAsync(argumentsToParse, { from: 'user' })
    return exitCode
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    throw error
  }
}

// the handlers and the output and where the running handler's status goes
interface CreateProgramOptions {
  handlers: CliHandlers
  output: CliOutput
  setExitCode: (exitCode: number) => void
}

// build the root program and attach every command
function createProgram({
  handlers,
  output,
  setExitCode,
}: CreateProgramOptions): Command {
  // the root writes through the given output and reports exits instead of ending the process
  const program: Command = new Command()
    .name('pull-request-review')
    .description('Reviews a pull request for security problems')
    .configureOutput({ writeOut: output.writeOut, writeErr: output.writeErr })
    .exitOverride()
    .showHelpAfterError()

  // attach the commands
  addReviewCommand({ program, handlers, setExitCode })
  addBenchmarkCommands({ program, handlers, setExitCode })
  program
    .command('refresh-advisories')
    .description('Downloads the OSV npm advisories into the cache')
    .action(async () => setExitCode(await handlers.refreshAdvisories()))
  program
    .command('validate-matcher')
    .description(
      'Compares the dependency matcher with osv-scanner over every committed lockfile',
    )
    .action(async () => setExitCode(await handlers.validateMatcher()))
  return program
}

// the program to add a command to with the handlers and the exit status setter
interface AddCommandOptions {
  program: Command
  handlers: CliHandlers
  setExitCode: (exitCode: number) => void
}

// the review command and its options
function addReviewCommand({
  program,
  handlers,
  setExitCode,
}: AddCommandOptions): void {
  program
    .command('review')
    .description('Reviews one GitHub pull request and writes the report')
    .argument('<pull-request>', 'a pull request url or owner/repository#number')
    .addOption(
      new Option('--format <format>', 'the report format')
        .choices(reportFormats)
        .default('html'),
    )
    .option('--out <directory>', 'the directory runs are written under', 'runs')
    .addOption(
      new Option(
        '--fail-on <severity>',
        'exit 1 when an introduced finding is at or above this severity',
      ).choices(failOnSeverities),
    )
    .option(
      '--no-llm',
      'run without the model: no code review and template summaries',
    )
    .option('--no-cache', 'skip the model response cache')
    .option('--offline', 'use the cached advisories without refreshing them')
    .option(
      '--model-review <model-id>',
      'the code-review model, such as anthropic/claude-sonnet-5-5',
    )
    .option('--model-summarize <model-id>', 'the summary model')
    .option(
      '--review-prompt-version <version>',
      'the code-review prompt version for this run',
      parsePromptVersion,
    )
    .action(async (pullRequest: string, commandOptions: RawReviewOptions) => {
      setExitCode(
        await handlers.review(
          toReviewCommandOptions(pullRequest, commandOptions),
        ),
      )
    })
}

// the benchmark command with its run and show subcommands
function addBenchmarkCommands({
  program,
  handlers,
  setExitCode,
}: AddCommandOptions): void {
  const benchmarkCommand = program
    .command('benchmark')
    .description('Runs and shows the benchmark')

  // run one split or both
  benchmarkCommand
    .command('run')
    .description(
      'Runs the pipeline over a benchmark split and writes the results',
    )
    .addOption(
      new Option('--split <split>', 'the split to run')
        .choices(benchmarkRunSplits)
        .makeOptionMandatory(),
    )
    .requiredOption(
      '--label <name>',
      'the label the results files are named with',
    )
    .option(
      '--review-prompt-version <version>',
      'the code-review prompt version for this run',
      parsePromptVersion,
    )
    .option('--no-llm', 'run without the model')
    .option('--no-cache', 'skip the model response cache')
    .action(async (commandOptions: RawBenchmarkRunOptions) => {
      setExitCode(
        await handlers.benchmarkRun({
          split: commandOptions.split,
          label: commandOptions.label,
          isLlmEnabled: commandOptions.llm,
          isCacheEnabled: commandOptions.cache,
          reviewPromptVersion: commandOptions.reviewPromptVersion,
        }),
      )
    })

  // print the latest metrics
  benchmarkCommand
    .command('show')
    .description('Prints the latest metrics of each split')
    .action(async () => setExitCode(await handlers.benchmarkShow()))
}

// the review options as commander parses them
interface RawReviewOptions {
  format: ReportFormat
  out: string
  failOn?: Severity
  llm: boolean
  cache: boolean
  offline?: boolean
  modelReview?: string
  modelSummarize?: string
  reviewPromptVersion?: string
}

// the benchmark run options as commander parses them
interface RawBenchmarkRunOptions {
  split: BenchmarkRunSplit
  label: string
  reviewPromptVersion?: string
  llm: boolean
  cache: boolean
}

// name the parsed review options the way the handler reads them
function toReviewCommandOptions(
  pullRequest: string,
  rawReviewOptions: RawReviewOptions,
): ReviewCommandOptions {
  return {
    pullRequest,
    format: rawReviewOptions.format,
    outDirectory: rawReviewOptions.out,
    failOnSeverity: rawReviewOptions.failOn,
    isLlmEnabled: rawReviewOptions.llm,
    isCacheEnabled: rawReviewOptions.cache,
    isOffline: rawReviewOptions.offline ?? false,
    reviewModelId: rawReviewOptions.modelReview,
    summarizeModelId: rawReviewOptions.modelSummarize,
    reviewPromptVersion: rawReviewOptions.reviewPromptVersion,
  }
}

// accept a positive whole number as a prompt version and keep it as text
function parsePromptVersion(value: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidArgumentError(
      'the prompt version is a positive whole number',
    )
  }
  return value
}
