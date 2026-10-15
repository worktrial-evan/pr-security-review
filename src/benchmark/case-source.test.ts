// tests for opening a case's pull request source: a snapshot case opens, an offline git case is skipped and a broken git case fails
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BenchmarkCase } from '@/shared/benchmark'
import { openPullRequestSource } from './case-source'
import { offlineEnvironmentVariable } from './git-pull-request-source'
import {
  type RestoreEnvironmentVariables,
  saveEnvironmentVariables,
} from './test-environment'

// the temporary directory holding the case trees and the cache of one test
let rootDirectory: string

// puts the offline variable back after each test
let restoreEnvironmentVariables: RestoreEnvironmentVariables

beforeEach(async () => {
  restoreEnvironmentVariables = saveEnvironmentVariables([
    offlineEnvironmentVariable,
  ])
  delete process.env[offlineEnvironmentVariable]
  rootDirectory = await mkdtemp(join(tmpdir(), 'benchmark-case-source-test-'))
})

afterEach(async () => {
  restoreEnvironmentVariables()
  await rm(rootDirectory, { recursive: true, force: true })
})

// a git case over the given url
function makeGitCase(repoUrl: string): BenchmarkCase {
  return {
    id: 'real-world-01-case',
    split: 'dev',
    category: 'real-world',
    isClean: false,
    description: 'a git case',
    source: {
      kind: 'git',
      repoUrl,
      baseSha: '0123456789abcdef0123456789abcdef01234567',
      headSha: 'fedcba9876543210fedcba9876543210fedcba98',
    },
    expected: [{ detector: 'code-review', cwe: 'CWE-79' }],
  }
}

describe('openPullRequestSource', () => {
  test('opens a snapshot case over the trees beside its case.json', async () => {
    // a case directory with a head tree
    const caseDirectory = join(rootDirectory, 'code-01-case')
    await mkdir(join(caseDirectory, 'base'), { recursive: true })
    await mkdir(join(caseDirectory, 'head'), { recursive: true })
    const benchmarkCase: BenchmarkCase = {
      id: 'code-01-case',
      split: 'dev',
      category: 'code',
      isClean: false,
      description: 'a snapshot case',
      source: { kind: 'snapshot', dir: 'benchmark/cases/code-01-case' },
      expected: [{ detector: 'code-review', cwe: 'CWE-89' }],
    }

    // the source checks head out as the head directory
    const sourceOpen = await openPullRequestSource({
      loadedCase: { benchmarkCase, caseDirectory },
      cacheDirectory: join(rootDirectory, 'cache'),
    })
    expect(sourceOpen.kind).toBe('opened')
    if (sourceOpen.kind === 'opened') {
      expect(await sourceOpen.pullRequestSource.checkoutHead()).toBe(
        join(caseDirectory, 'head'),
      )
      await sourceOpen.pullRequestSource.dispose()
    }
  })

  test('skips a git case while the offline flag is set', async () => {
    process.env[offlineEnvironmentVariable] = '1'
    const sourceOpen = await openPullRequestSource({
      loadedCase: {
        benchmarkCase: makeGitCase('https://example.invalid/owner/repo.git'),
        caseDirectory: join(rootDirectory, 'real-world-01-case'),
      },
      cacheDirectory: join(rootDirectory, 'cache'),
    })
    expect(sourceOpen.kind).toBe('skipped')
    if (sourceOpen.kind === 'skipped') {
      expect(sourceOpen.reason).toContain(offlineEnvironmentVariable)
    }
  })

  test('fails a git case whose url is not a repository', async () => {
    // a file url nothing is at
    const sourceOpen = await openPullRequestSource({
      loadedCase: {
        benchmarkCase: makeGitCase(`file://${join(rootDirectory, 'missing')}`),
        caseDirectory: join(rootDirectory, 'real-world-01-case'),
      },
      cacheDirectory: join(rootDirectory, 'cache'),
    })
    expect(sourceOpen.kind).toBe('failed')
    if (sourceOpen.kind === 'failed') {
      expect(sourceOpen.errorMessage).toContain('git clone')
    }
  })
})
