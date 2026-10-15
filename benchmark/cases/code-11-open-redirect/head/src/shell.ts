// reports the host system name by running one constant command
import { $ } from 'bun'

/**
 * Returns the kernel name and release of the host, or unknown when the command fails.
 */
export async function readSystemName(): Promise<string> {
  // run the fixed command without throwing on a non-zero exit
  const commandResult = await $`uname -sr`.nothrow().quiet()
  if (commandResult.exitCode !== 0) {
    return 'unknown'
  }

  return commandResult.stdout.toString().trim()
}
