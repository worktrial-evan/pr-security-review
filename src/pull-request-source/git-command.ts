// runs git with settings that keep its output independent of the user's git config
import { $ } from 'bun'

// global options on every call: unquoted paths and pathspecs taken literally
const globalGitArguments = ['-c', 'core.quotepath=false', '--literal-pathspecs']

// the variables git ties to one repository, as git rev-parse --local-env-vars prints them.
// a git hook exports them for its own repository, so they are dropped from every command
const repositoryEnvironmentVariables = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
]

export interface RunGitOptions {
  repoPath: string
  gitArguments: string[]
  environment?: Record<string, string>
}

export interface GitCommandErrorOptions {
  gitArguments: string[]
  exitCode: number
  stderr: string
}

// thrown when a git command exits non-zero. holds the arguments and git's stderr
export class GitCommandError extends Error {
  readonly gitArguments: string[]
  readonly exitCode: number
  readonly stderr: string

  constructor({ gitArguments, exitCode, stderr }: GitCommandErrorOptions) {
    super(
      `git ${gitArguments.join(' ')} exited with ${exitCode}: ${stderr.trim()}`,
    )
    this.name = 'GitCommandError'
    this.gitArguments = gitArguments
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

/**
 * Runs git in a directory and returns its stdout, throwing a GitCommandError on a non-zero exit.
 */
export async function runGit({
  repoPath,
  gitArguments,
  environment = {},
}: RunGitOptions): Promise<string> {
  // run in repoPath alone, with the caller's extra environment on top
  const commandEnvironment = buildCommandEnvironment(environment)
  const gitOutput =
    await $`git -C ${repoPath} ${globalGitArguments} ${gitArguments}`
      .env(commandEnvironment)
      .nothrow()
      .quiet()

  // fail with git's own message
  if (gitOutput.exitCode !== 0) {
    throw new GitCommandError({
      gitArguments,
      exitCode: gitOutput.exitCode,
      stderr: gitOutput.stderr.toString(),
    })
  }
  return gitOutput.stdout.toString()
}

// copy the process environment without the repository variables, turn off prompts and add the extras
function buildCommandEnvironment(
  environment: Record<string, string>,
): Record<string, string | undefined> {
  const commandEnvironment: Record<string, string | undefined> = {
    ...process.env,
  }
  for (const variableName of repositoryEnvironmentVariables) {
    delete commandEnvironment[variableName]
  }
  return { ...commandEnvironment, GIT_TERMINAL_PROMPT: '0', ...environment }
}
