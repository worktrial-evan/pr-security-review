// command-line entry for pull-request-review. runs the cli on the process arguments and exits with its status
import { createCliHandlers } from '@/cli/cli-handlers'
import { runCli } from '@/cli/program'
import { createProcessOutput } from '@/cli/terminal-text'

// run the command and hand its status to the process
const output = createProcessOutput()
process.exitCode = await runCli({
  commandArguments: process.argv.slice(2),
  handlers: createCliHandlers(output),
  output,
})
