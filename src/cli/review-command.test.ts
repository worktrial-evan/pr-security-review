// tests the review command over a snapshot pull request and a local repository. checks the report and audit log on disk and the exit statuses and the fast failures and a cancelled run
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveEnvironmentVariables } from '@/benchmark/test-environment'
import { GitPullRequestSource } from '@/pull-request-source/git-pull-request-source'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { createTwoCommitRepository } from '@/pull-request-source/test-git-repository'
import { auditEventSchema } from '@/shared/audit'
import { cacheDirectoryEnvironmentVariable } from '@/shared/cache-directory'
import { reviewResultSchema } from '@/shared/review'
import type { ReviewCommandOptions } from './program'
import {
  type RunReviewCommandOptions,
  runReviewCommand,
} from './review-command'
import type { CliOutput } from './terminal-text'

// a token built inside the test so no realistic credential is committed
const githubToken = `ghp_${'Ab3dE5gH'.repeat(4)}Ab3d`

// the temporary directory of the current test and the variables it changes
let temporaryDirectory: string
let restoreEnvironmentVariables: () => void

// the run directory every test passes as --out
let runDirectory: string

beforeEach(async () => {
  // keep every cache inside the temporary directory
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-cli-'))
  runDirectory = join(temporaryDirectory, 'run')
  restoreEnvironmentVariables = saveEnvironmentVariables([
    cacheDirectoryEnvironmentVariable,
  ])
  process.env[cacheDirectoryEnvironmentVariable] = join(
    temporaryDirectory,
    'cache',
  )

  // a pull request that adds a token to one file
  await Bun.write(
    join(temporaryDirectory, 'base', 'src', 'config.ts'),
    'export const name = "app"\n',
  )
  await Bun.write(
    join(temporaryDirectory, 'head', 'src', 'config.ts'),
    `export const name = "app"\nexport const token = '${githubToken}'\n`,
  )
})

afterEach(async () => {
  restoreEnvironmentVariables()
  await rm(temporaryDirectory, { recursive: true, force: true })
})

// the outcome of one command run
interface ReviewCommandRun {
  exitCode: number
  standardOutput: string
  standardError: string
  openCount: number
}

// run the review command over the snapshot with the given flags
async function runSnapshotReview(
  overrides: Partial<ReviewCommandOptions>,
  environment: Record<string, string | undefined> = {},
): Promise<ReviewCommandRun> {
  // record what the command writes and how often it opens the pull request
  const writtenText = { standardOutput: '', standardError: '' }
  const output: CliOutput = {
    writeOut: (text) => {
      writtenText.standardOutput += text
    },
    writeErr: (text) => {
      writtenText.standardError += text
    },
  }
  let openCount = 0

  // run with the snapshot in place of a clone
  const exitCode = await runReviewCommand({
    commandOptions: {
      target: { kind: 'github', pullRequest: 'octocat/hello-world#42' },
      format: 'html',
      outDirectory: runDirectory,
      failOnSeverity: undefined,
      isLlmEnabled: false,
      isCacheEnabled: true,
      isOffline: true,
      reviewModelId: undefined,
      summarizeModelId: undefined,
      reviewPromptVersion: undefined,
      ...overrides,
    },
    environment,
    output,
    openPullRequestSource: async () => {
      openCount += 1
      return new SnapshotPullRequestSource({
        baseDirectory: join(temporaryDirectory, 'base'),
        headDirectory: join(temporaryDirectory, 'head'),
      })
    },
  })
  return { exitCode, openCount, ...writtenText }
}

// read the audit log of a run directory as its lines
async function readAuditLines(auditRunDirectory: string): Promise<string[]> {
  const auditText = await Bun.file(
    join(auditRunDirectory, 'audit.jsonl'),
  ).text()
  return auditText.trim().split('\n')
}

describe('runReviewCommand', () => {
  test('writes the html report and the audit log into the run directory and prints the link and summary', async () => {
    const reviewCommandRun = await runSnapshotReview({})

    // the report and the log sit directly in the run directory
    expect((await readdir(runDirectory)).sort()).toEqual([
      'audit.jsonl',
      'report.html',
    ])
    const reportHtml = await Bun.file(join(runDirectory, 'report.html')).text()
    expect(reportHtml).toContain('<h1>Pull request security review</h1>')
    const auditLines = await readAuditLines(runDirectory)
    for (const auditLine of auditLines) {
      expect(auditEventSchema.safeParse(JSON.parse(auditLine)).success).toBe(
        true,
      )
    }

    // the token never reaches the audit log
    expect(auditLines.join('\n')).not.toContain(githubToken)

    // the link and the summary and a clean exit
    expect(reviewCommandRun.exitCode).toBe(0)
    expect(reviewCommandRun.standardOutput).toContain(
      `report: file://${runDirectory}/report.html`,
    )
    expect(reviewCommandRun.standardOutput).toContain(
      '1 introduced (1 critical)',
    )
  })

  test('writes under runs/<runId> when no run directory is given', async () => {
    // run from the temporary directory so the default lands there
    const originalWorkingDirectory = process.cwd()
    process.chdir(temporaryDirectory)
    try {
      const reviewCommandRun = await runSnapshotReview({
        outDirectory: undefined,
      })

      // one run directory named by the run id holds the report and the log
      const runIds = await readdir(join(temporaryDirectory, 'runs'))
      expect(runIds).toHaveLength(1)
      const defaultRunDirectory = join(process.cwd(), 'runs', runIds[0] ?? '')
      expect((await readdir(defaultRunDirectory)).sort()).toEqual([
        'audit.jsonl',
        'report.html',
      ])
      expect(reviewCommandRun.standardOutput).toContain(
        `report: file://${defaultRunDirectory}/report.html`,
      )
    } finally {
      process.chdir(originalWorkingDirectory)
    }
  })

  test('writes a json report and exits 1 when fail-on is met', async () => {
    const reviewCommandRun = await runSnapshotReview({
      format: 'json',
      failOnSeverity: 'high',
    })

    const reportJson = await Bun.file(join(runDirectory, 'report.json')).json()
    expect(reviewResultSchema.safeParse(reportJson).success).toBe(true)
    expect(reviewCommandRun.exitCode).toBe(1)
  })

  test('reviews two commits of a local repository without opening a pull request', async () => {
    // a repository whose two commits hold the base and head trees
    const twoCommitRepository = await createTwoCommitRepository({
      baseDirectory: join(temporaryDirectory, 'base'),
      headDirectory: join(temporaryDirectory, 'head'),
    })
    try {
      const reviewCommandRun = await runSnapshotReview({
        target: {
          kind: 'local',
          repositoryPath: twoCommitRepository.repositoryPath,
          baseSha: twoCommitRepository.baseSha,
          headSha: twoCommitRepository.headSha,
        },
        format: 'json',
      })

      // the report is written and the description names the shas and no pull request
      const reportJson = await Bun.file(
        join(runDirectory, 'report.json'),
      ).json()
      const reviewResult = reviewResultSchema.parse(reportJson)
      expect(reviewResult.metadata.pullRequestReference).toBeUndefined()
      expect(reviewResult.metadata.baseSha).toBe(twoCommitRepository.baseSha)
      expect(reviewResult.metadata.headSha).toBe(twoCommitRepository.headSha)

      // the token in the head commit is found and no pull request was opened
      expect(reviewCommandRun.exitCode).toBe(0)
      expect(reviewCommandRun.standardOutput).toContain(
        '1 introduced (1 critical)',
      )
      expect(reviewCommandRun.openCount).toBe(0)
    } finally {
      await rm(twoCommitRepository.repositoryPath, {
        recursive: true,
        force: true,
      })
    }
  })

  test('fails fast naming the missing api key without opening the pull request', async () => {
    const reviewCommandRun = await runSnapshotReview(
      {
        isLlmEnabled: true,
        reviewModelId: 'anthropic/review-model',
        summarizeModelId: 'anthropic/summarize-model',
      },
      {},
    )

    expect(reviewCommandRun.exitCode).toBe(2)
    expect(reviewCommandRun.standardError).toContain('ANTHROPIC_API_KEY')
    expect(reviewCommandRun.openCount).toBe(0)
  })

  test('exits 2 on a reference it cannot parse', async () => {
    const reviewCommandRun = await runSnapshotReview({
      target: { kind: 'github', pullRequest: 'not a pull request' },
    })

    expect(reviewCommandRun.exitCode).toBe(2)
    expect(reviewCommandRun.standardError).toContain(
      'cannot read the pull request',
    )
    expect(reviewCommandRun.openCount).toBe(0)
  })
})

describe('runReviewCommand cancellation', () => {
  test('ends the log with the cancelled note, exits 130, writes no report and removes the head worktree on SIGINT', async () => {
    // a repository whose two commits hold the base and head trees. the opener checks its head out before the run
    const twoCommitRepository = await createTwoCommitRepository({
      baseDirectory: join(temporaryDirectory, 'base'),
      headDirectory: join(temporaryDirectory, 'head'),
    })
    let worktreeDirectory = ''
    const openPullRequestSource = async () => {
      const gitPullRequestSource = new GitPullRequestSource({
        repositoryPath: twoCommitRepository.repositoryPath,
        baseSha: twoCommitRepository.baseSha,
        headSha: twoCommitRepository.headSha,
      })
      worktreeDirectory = await gitPullRequestSource.checkoutHead()
      return gitPullRequestSource
    }

    // a model provider that sends SIGINT from its first call and answers with no findings
    const signalSource = new EventEmitter()
    const llmProvider: NonNullable<RunReviewCommandOptions['llmProvider']> = {
      async generate() {
        signalSource.emit('SIGINT')
        return {
          rawOutput: { findings: [], injectionAttempts: [] },
          usage: { inputTokens: 0, outputTokens: 0 },
        }
      },
    }

    // run with the llm on and a recording exit
    const exitCodes: number[] = []
    const writtenText = { standardOutput: '', standardError: '' }
    try {
      const exitCode = await runReviewCommand({
        commandOptions: {
          target: { kind: 'github', pullRequest: 'octocat/hello-world#42' },
          format: 'html',
          outDirectory: runDirectory,
          failOnSeverity: undefined,
          isLlmEnabled: true,
          isCacheEnabled: false,
          isOffline: true,
          reviewModelId: undefined,
          summarizeModelId: undefined,
          reviewPromptVersion: undefined,
        },
        environment: { ANTHROPIC_API_KEY: 'not-a-real-key' },
        output: {
          writeOut: (text) => {
            writtenText.standardOutput += text
          },
          writeErr: (text) => {
            writtenText.standardError += text
          },
        },
        openPullRequestSource,
        llmProvider,
        signalSource,
        exit: (code) => {
          exitCodes.push(code)
        },
      })

      // the command and the exit both carry 130 and nothing was printed
      expect(exitCode).toBe(130)
      expect(exitCodes).toEqual([130])
      expect(writtenText).toEqual({ standardOutput: '', standardError: '' })

      // the last line of the log is the cancelled note naming the signal and the stage
      const auditLines = await readAuditLines(runDirectory)
      expect(JSON.parse(auditLines.at(-1) ?? '')).toMatchObject({
        kind: 'note',
        step: 'run',
        payload: {
          message: 'run cancelled',
          status: 'cancelled',
          signal: 'SIGINT',
          stage: 'code-review',
        },
      })

      // no report was written and the head worktree is gone
      expect(await readdir(runDirectory)).toEqual(['audit.jsonl'])
      expect(worktreeDirectory).not.toBe('')
      expect(existsSync(worktreeDirectory)).toBe(false)
      expect(signalSource.listenerCount('SIGINT')).toBe(0)
    } finally {
      await rm(twoCommitRepository.repositoryPath, {
        recursive: true,
        force: true,
      })
    }
  })
})
