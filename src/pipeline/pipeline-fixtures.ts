// test support for the pipeline. it has an in-memory audit sink and run settings and a snapshot pull request on disk and a fixed clock
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuditEvent, AuditSink } from '@/shared/audit'
import type { ReviewOptions } from '@/shared/review'
import type { RunSettings } from './review-settings'

// an audit sink that keeps every event in memory
export interface MemoryAuditSink extends AuditSink {
  readonly events: AuditEvent[]
}

/**
 * Creates an audit sink that appends every event to its events list.
 */
export function createMemoryAuditSink(): MemoryAuditSink {
  const events: AuditEvent[] = []
  return {
    events,
    async write(event: AuditEvent): Promise<void> {
      events.push(event)
    },
  }
}

// the two priced model ids the pipeline tests configure
export const testReviewModelId = 'anthropic/test-review-model'
export const testSummarizeModelId = 'anthropic/test-summarize-model'

// the run settings the pipeline tests use: the shipped limits and prices for the two test models
export const testRunSettings: RunSettings = {
  limits: {
    maxChangedFiles: 200,
    maxFileBytes: 1_000_000,
    maxReviewCostUsd: 2,
  },
  reviewPromptVersion: '1',
  advisoryStaleHours: 24,
  modelPrices: {
    [testReviewModelId]: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
    [testSummarizeModelId]: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
    },
  },
}

// the review options the pipeline tests start from: offline against the committed advisory fixture
export const testReviewOptions: ReviewOptions = {
  isLlmEnabled: true,
  isCacheEnabled: false,
  isOffline: true,
  advisoryCacheDir: join(import.meta.dir, '..', '..', 'benchmark', 'fixtures'),
  reviewModelId: testReviewModelId,
  summarizeModelId: testSummarizeModelId,
  contextLines: 3,
}

// a token built inside the test so no realistic credential is committed
export const testGithubToken = `ghp_${'Ab3dE5gH'.repeat(4)}Ab3d`

// the bun lockfile fixtures a snapshot pull request bumps between
const lockfileFixturesDirectory = join(
  import.meta.dir,
  '..',
  'lockfile',
  'fixtures',
  'bun',
)

// a snapshot pull request on disk and the directory holding both trees
export interface SnapshotPullRequest {
  rootDir: string
  baseDir: string
  headDir: string
}

/**
 * Writes a snapshot pull request that bumps the bun lockfile, adds a token and adds one 5,000 character line.
 */
export async function writeSnapshotPullRequest(): Promise<SnapshotPullRequest> {
  // copy the lockfile fixtures into base and head
  const rootDir = await mkdtemp(join(tmpdir(), 'pull-request-review-pipeline-'))
  const baseDir = join(rootDir, 'base')
  const headDir = join(rootDir, 'head')
  await cp(join(lockfileFixturesDirectory, 'diff-base'), baseDir, {
    recursive: true,
  })
  await cp(join(lockfileFixturesDirectory, 'diff-head'), headDir, {
    recursive: true,
  })

  // add a source file at base and change it at head
  await Bun.write(
    join(baseDir, 'src', 'config.ts'),
    'export const name = "app"\n',
  )
  await Bun.write(
    join(headDir, 'src', 'config.ts'),
    `export const name = "app"\nexport const token = '${testGithubToken}'\n`,
  )

  // add a minified file with one overlong line
  await Bun.write(
    join(headDir, 'public', 'app.min.js'),
    `${'a'.repeat(5000)}\n`,
  )
  return { rootDir, baseDir, headDir }
}

/**
 * Removes a snapshot pull request from disk.
 */
export async function removeSnapshotPullRequest(
  snapshotPullRequest: SnapshotPullRequest,
): Promise<void> {
  await rm(snapshotPullRequest.rootDir, { recursive: true, force: true })
}

/**
 * Makes a clock that starts at a fixed time and advances one millisecond per reading.
 */
export function makeTestClock(): () => Date {
  let readingCount = 0
  const startTime = Date.parse('2026-10-15T12:00:00.000Z')
  return () => {
    const reading = new Date(startTime + readingCount)
    readingCount += 1
    return reading
  }
}
