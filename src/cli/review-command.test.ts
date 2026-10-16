// tests the review command over a snapshot pull request. checks the report and audit log on disk and the exit statuses and the fast failures
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveEnvironmentVariables } from '@/benchmark/test-environment'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import { auditEventSchema } from '@/shared/audit'
import { cacheDirectoryEnvironmentVariable } from '@/shared/cache-directory'
import { reviewResultSchema } from '@/shared/review'
import type { ReviewCommandOptions } from './program'
import { runReviewCommand } from './review-command'
import type { CliOutput } from './terminal-text'

// a token built inside the test so no realistic credential is committed
const githubToken = `ghp_${'Ab3dE5gH'.repeat(4)}Ab3d`

// the temporary directory of the current test and the variables it changes
let temporaryDirectory: string
let restoreEnvironmentVariables: () => void

beforeEach(async () => {
  // keep every cache inside the temporary directory
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-cli-'))
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
      pullRequest: 'octocat/hello-world#42',
      format: 'html',
      outDirectory: join(temporaryDirectory, 'runs'),
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

// the single run directory a review wrote
async function readRunDirectory(): Promise<string> {
  const runIds = await readdir(join(temporaryDirectory, 'runs'))
  expect(runIds).toHaveLength(1)
  return join(temporaryDirectory, 'runs', runIds[0] ?? '')
}

describe('runReviewCommand', () => {
  test('writes the html report and the audit log and prints the link and summary', async () => {
    const reviewCommandRun = await runSnapshotReview({})

    // the report and the log sit in the run directory
    const runDirectory = await readRunDirectory()
    const reportHtml = await Bun.file(join(runDirectory, 'report.html')).text()
    expect(reportHtml).toContain('<h1>Pull request security review</h1>')
    const auditLines = (
      await Bun.file(join(runDirectory, 'audit.jsonl')).text()
    )
      .trim()
      .split('\n')
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

  test('writes a json report and exits 1 when fail-on is met', async () => {
    const reviewCommandRun = await runSnapshotReview({
      format: 'json',
      failOnSeverity: 'high',
    })

    const runDirectory = await readRunDirectory()
    const reportJson = await Bun.file(join(runDirectory, 'report.json')).json()
    expect(reviewResultSchema.safeParse(reportJson).success).toBe(true)
    expect(reviewCommandRun.exitCode).toBe(1)
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
      pullRequest: 'not a pull request',
    })

    expect(reviewCommandRun.exitCode).toBe(2)
    expect(reviewCommandRun.standardError).toContain(
      'cannot read the pull request',
    )
    expect(reviewCommandRun.openCount).toBe(0)
  })
})
