// tests the pr-review command-line entry by spawning it with no command, with --help and with an unknown command

import { describe, expect, test } from 'bun:test'

// the exit code and both output streams of one run of the entry
interface EntryRun {
  exitCode: number
  stdout: string
  stderr: string
}

// the repository root the entry is spawned from
const repositoryRoot = import.meta.dir

// the first line of the usage text commander prints for the program
const usageLine = 'Usage: pr-review [options] [command]'

// cover the three invocations the cli spec names
describe('index.ts', () => {
  test('prints usage to stdout and exits 0 with no command', async () => {
    // run the entry with no arguments
    const noCommandRun = await runEntry([])

    // expect the usage text on stdout, nothing on stderr and a clean exit
    expect(noCommandRun.exitCode).toBe(0)
    expect(noCommandRun.stdout).toContain(usageLine)
    expect(noCommandRun.stderr).toBe('')
  })

  test('prints the same usage to stdout and exits 0 with --help', async () => {
    // run the entry with the help flag and once more with no arguments
    const helpRun = await runEntry(['--help'])
    const noCommandRun = await runEntry([])

    // expect the same usage text as the no-command run and a clean exit
    expect(helpRun.exitCode).toBe(0)
    expect(helpRun.stdout).toContain(usageLine)
    expect(helpRun.stdout).toBe(noCommandRun.stdout)
    expect(helpRun.stderr).toBe('')
  })

  test('names an unknown command on stderr with usage and exits 1', async () => {
    // run the entry with a command it does not know
    const unknownCommandRun = await runEntry(['frobnicate'])

    // expect the command named on stderr, the usage text after it and exit 1
    expect(unknownCommandRun.exitCode).toBe(1)
    expect(unknownCommandRun.stderr).toContain("unknown command 'frobnicate'")
    expect(unknownCommandRun.stderr).toContain(usageLine)
    expect(unknownCommandRun.stdout).toBe('')
  })
})

// spawn the entry with the given arguments and collect its exit code and output
async function runEntry(entryArguments: string[]): Promise<EntryRun> {
  // run the entry under the same bun binary that runs the tests
  const entryCommand = [process.execPath, 'index.ts', ...entryArguments]
  const entryProcess = Bun.spawn(entryCommand, {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // read both streams in full and wait for the process to exit
  const stdout = await new Response(entryProcess.stdout).text()
  const stderr = await new Response(entryProcess.stderr).text()
  const exitCode = await entryProcess.exited

  return { exitCode, stdout, stderr }
}
