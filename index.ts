// command-line entry for pr-review. builds the commander program and prints usage until the real commands land

import { Command } from 'commander'

// build the program with its name, description and one optional command argument
const program: Command = new Command()
  .name('pr-review')
  .description('Reviews a pull request for security problems')
  .argument('[command]', 'the command to run')
  .showHelpAfterError()
  .action(runCommand)

// run the program against the process arguments
program.parse()

// print help and exit 0 with no command, or reject the unknown command and exit 1
function runCommand(commandName: string | undefined): never {
  // print help to stdout and exit 0 when no command was given
  if (commandName === undefined) {
    program.help()
  }

  // print the unknown command and the help text to stderr and exit 1
  program.error(`unknown command '${commandName}'`, { exitCode: 1 })
}
