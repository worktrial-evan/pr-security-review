// builds the environment every git command in this module runs with: the process environment without the variables a git hook exports, so a command never acts on the repository that ran the hook

// the prefix of every variable git exports to a hook. GIT_DIR alone points every git command at that repository
const gitVariablePrefix = 'GIT_'

/**
 * Returns the process environment without any GIT_ variable and with the credential prompt turned off.
 */
export function cleanGitEnvironment(): Record<string, string> {
  // copy every set variable that git did not export
  const environment: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined || name.startsWith(gitVariablePrefix)) {
      continue
    }
    environment[name] = value
  }

  // never let git prompt for credentials
  environment.GIT_TERMINAL_PROMPT = '0'
  return environment
}
