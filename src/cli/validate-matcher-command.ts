// the validate-matcher command. it runs the validate-matcher script and passes its output and exit status through
import { join } from 'node:path'
import { resolveRepositoryRoot } from '@/benchmark/cases'
import type { CliOutput } from './terminal-text'

// the script that compares the hand-written matcher with osv-scanner over every committed lockfile
export const validateMatcherScriptPath = join(
  resolveRepositoryRoot(),
  'scripts',
  'validate-matcher.ts',
)

// where to write and which script to run. tests replace the script
export interface RunValidateMatcherCommandOptions {
  output: CliOutput
  scriptPath?: string
}

/**
 * Runs the validate-matcher script from the repository root, writes its output and returns its exit status.
 */
export async function runValidateMatcherCommand({
  output,
  scriptPath = validateMatcherScriptPath,
}: RunValidateMatcherCommandOptions): Promise<number> {
  // run the script under the bun that runs the cli
  const validateProcess = Bun.spawn([process.execPath, scriptPath], {
    cwd: resolveRepositoryRoot(),
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // pass both streams through the output once the script ends
  const [standardOutput, standardError, exitCode] = await Promise.all([
    new Response(validateProcess.stdout).text(),
    new Response(validateProcess.stderr).text(),
    validateProcess.exited,
  ])
  output.writeOut(standardOutput)
  output.writeErr(standardError)
  return exitCode
}
