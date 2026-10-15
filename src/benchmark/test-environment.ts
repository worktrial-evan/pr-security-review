// saves and restores environment variables for the tests that point the cache and the offline flag somewhere else

// the function that puts the saved variables back
export type RestoreEnvironmentVariables = () => void

/**
 * Saves the named environment variables and returns the function that puts them back, unsetting the ones that were unset.
 */
export function saveEnvironmentVariables(
  names: readonly string[],
): RestoreEnvironmentVariables {
  // remember the value of each variable. undefined means it was unset
  const savedValues = new Map<string, string | undefined>()
  for (const name of names) {
    savedValues.set(name, process.env[name])
  }

  // put every variable back the way it was
  return () => {
    for (const [name, savedValue] of savedValues) {
      if (savedValue === undefined) {
        delete process.env[name]
        continue
      }
      process.env[name] = savedValue
    }
  }
}
