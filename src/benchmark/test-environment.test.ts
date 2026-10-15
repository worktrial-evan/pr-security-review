// tests for the environment variable save and restore the module's tests share
import { expect, test } from 'bun:test'
import { saveEnvironmentVariables } from './test-environment'

// two variable names no other code reads
const setVariable = 'PULL_REQUEST_REVIEW_TEST_SET_VARIABLE'
const unsetVariable = 'PULL_REQUEST_REVIEW_TEST_UNSET_VARIABLE'

test('restores a set variable to its value and an unset variable to unset', () => {
  // start with one variable set and one unset
  process.env[setVariable] = 'before'
  delete process.env[unsetVariable]
  const restoreEnvironmentVariables = saveEnvironmentVariables([
    setVariable,
    unsetVariable,
  ])

  // change both, then restore
  process.env[setVariable] = 'during'
  process.env[unsetVariable] = 'during'
  restoreEnvironmentVariables()
  expect(process.env[setVariable]).toBe('before')
  expect(process.env[unsetVariable]).toBeUndefined()

  // leave nothing behind
  delete process.env[setVariable]
})
