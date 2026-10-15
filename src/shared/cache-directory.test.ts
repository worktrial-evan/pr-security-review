// tests for resolveCacheDirectory: the environment variable wins when it is set and the home cache is the default otherwise
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cacheDirectoryEnvironmentVariable,
  resolveCacheDirectory,
} from './cache-directory'

// the default directory every fallback test expects
const defaultCacheDirectory = join(homedir(), '.cache', 'pull-request-review')

// the value of the variable before each test. undefined means it was unset
let savedCacheDirectoryVariable: string | undefined

beforeEach(() => {
  savedCacheDirectoryVariable = process.env[cacheDirectoryEnvironmentVariable]
})

afterEach(() => {
  restoreCacheDirectoryVariable()
})

describe('resolveCacheDirectory', () => {
  test('returns exactly the directory named by the environment variable', () => {
    // point the variable at a temp path
    const configuredCacheDirectory = join(
      tmpdir(),
      'pull-request-review-cache-test',
    )
    process.env[cacheDirectoryEnvironmentVariable] = configuredCacheDirectory

    expect(resolveCacheDirectory()).toBe(configuredCacheDirectory)
  })

  test('falls back to .cache/pull-request-review under the home directory when the variable is unset', () => {
    // clear the variable
    delete process.env[cacheDirectoryEnvironmentVariable]

    // expect the default under the home directory
    const cacheDirectory = resolveCacheDirectory()
    expect(cacheDirectory).toStartWith(homedir())
    expect(cacheDirectory).toEndWith(join('.cache', 'pull-request-review'))
    expect(cacheDirectory).toBe(defaultCacheDirectory)
  })

  test('falls back to the default when the variable is an empty string', () => {
    // set the variable to nothing
    process.env[cacheDirectoryEnvironmentVariable] = ''

    expect(resolveCacheDirectory()).toBe(defaultCacheDirectory)
  })
})

// put the variable back the way it was before the test
function restoreCacheDirectoryVariable(): void {
  if (savedCacheDirectoryVariable === undefined) {
    delete process.env[cacheDirectoryEnvironmentVariable]
    return
  }
  process.env[cacheDirectoryEnvironmentVariable] = savedCacheDirectoryVariable
}
