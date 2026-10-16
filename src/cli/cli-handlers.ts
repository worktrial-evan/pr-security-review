// the real command handlers the entry point runs. each reads the process environment and writes to the given output
import { runRefreshAdvisoriesCommand } from '@/advisories/refresh-advisories-command'
import { describeError } from '@/benchmark/error-messages'
import {
  runBenchmarkCommand,
  runBenchmarkShowCommand,
} from './benchmark-command'
import type { CliHandlers } from './program'
import { runReviewCommand } from './review-command'
import type { CliOutput } from './terminal-text'
import { runValidateMatcherCommand } from './validate-matcher-command'

/**
 * Creates the handlers that run each command for real against the process environment.
 */
export function createCliHandlers(output: CliOutput): CliHandlers {
  const environment = process.env
  return {
    review: (commandOptions) =>
      runReviewCommand({ commandOptions, environment, output }),
    benchmarkRun: (commandOptions) =>
      runBenchmarkCommand({ commandOptions, environment, output }),
    benchmarkShow: () => runBenchmarkShowCommand({ output }),
    validateMatcher: () => runValidateMatcherCommand({ output }),
    async refreshAdvisories() {
      try {
        await runRefreshAdvisoriesCommand()
        return 0
      } catch (error) {
        output.writeErr(`${describeError(error)}\n`)
        return 1
      }
    },
  }
}
