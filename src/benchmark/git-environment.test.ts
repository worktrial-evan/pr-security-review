// tests for cleanGitEnvironment: the hook variables are dropped, the rest is kept and the prompt is off
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanGitEnvironment } from './git-environment'
import {
  type RestoreEnvironmentVariables,
  saveEnvironmentVariables,
} from './test-environment'

// the variables git exports to a hook, as a hook would see them
const hookVariables = {
  GIT_DIR: '/somewhere/.git',
  GIT_INDEX_FILE: '/somewhere/.git/index',
  GIT_WORK_TREE: '/somewhere',
  GIT_EDITOR: 'true',
}

// puts the hook variables and the prompt variable back after each test
let restoreEnvironmentVariables: RestoreEnvironmentVariables

beforeEach(() => {
  // save the variables and set them the way a hook does
  restoreEnvironmentVariables = saveEnvironmentVariables([
    ...Object.keys(hookVariables),
    'GIT_TERMINAL_PROMPT',
    'PULL_REQUEST_REVIEW_PROBE',
  ])
  Object.assign(process.env, hookVariables)
  process.env.PULL_REQUEST_REVIEW_PROBE = 'kept'
})

afterEach(() => {
  restoreEnvironmentVariables()
})

describe('cleanGitEnvironment', () => {
  test('drops every GIT_ variable a hook exports', () => {
    const environment = cleanGitEnvironment()

    // expect none of the hook variables to survive
    for (const name of Object.keys(hookVariables)) {
      expect(environment[name]).toBeUndefined()
    }
  })

  test('keeps the other variables and turns the prompt off', () => {
    const environment = cleanGitEnvironment()

    // expect the ordinary variables kept and the prompt variable set to 0
    expect(environment.PULL_REQUEST_REVIEW_PROBE).toBe('kept')
    expect(environment.PATH).toBe(process.env.PATH ?? '')
    expect(environment.GIT_TERMINAL_PROMPT).toBe('0')
  })
})
