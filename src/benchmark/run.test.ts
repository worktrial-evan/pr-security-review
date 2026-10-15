// tests for the benchmark runner over a stub pipeline and a three-case corpus built in a temporary directory
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { BenchmarkCase } from '@/shared/benchmark'
import { cacheDirectoryEnvironmentVariable } from '@/shared/cache-directory'
import type { ReviewOptions } from '@/shared/review'
import { benchmarkAdvisoryFixtureDirectory } from './cases'
import { offlineEnvironmentVariable } from './git-pull-request-source'
import { runBenchmark } from './run'
import type { BenchmarkRunResults } from './run-results'
import {
  cannedModelIds,
  cannedPromptVersions,
  changedUsersFile,
  cleanCase,
  cleanCaseId,
  codeCase,
  codeCaseId,
  fakeAppFiles,
  fakeGitSha,
  gitCase,
  gitCaseId,
  makeClock,
  makeStubPipeline,
  runStartedAt,
  type StubPipeline,
  scaCase,
  scaCaseId,
  unreachableRepoUrl,
} from './stub-pipeline'
import {
  type RestoreEnvironmentVariables,
  saveEnvironmentVariables,
} from './test-environment'

// the label every run in this file writes under
const runLabel = 'stub'

// the date the advisory fixture of this file claims to be fetched at
const advisorySnapshotDate = '2026-10-01T00:00:00.000Z'

// the temporary directories of one test
let casesDirectory: string
let resultsDirectory: string
let advisoryCacheDirectory: string
let cacheDirectory: string

// puts the cache and offline variables back after each test
let restoreEnvironmentVariables: RestoreEnvironmentVariables

beforeEach(async () => {
  // save the environment and point the cache at a temporary directory
  restoreEnvironmentVariables = saveEnvironmentVariables([
    cacheDirectoryEnvironmentVariable,
    offlineEnvironmentVariable,
  ])
  cacheDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-cache-'))
  process.env[cacheDirectoryEnvironmentVariable] = cacheDirectory
  delete process.env[offlineEnvironmentVariable]

  // build the corpus, the results directory and the advisory fixture
  casesDirectory = await mkdtemp(join(tmpdir(), 'pull-request-review-cases-'))
  resultsDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-results-'),
  )
  advisoryCacheDirectory = await mkdtemp(
    join(tmpdir(), 'pull-request-review-advisories-'),
  )
  await writeSnapshotCase(codeCase)
  await writeSnapshotCase(cleanCase)
  await writeSnapshotCase(scaCase)
  await Bun.write(
    join(advisoryCacheDirectory, 'snapshot.json'),
    JSON.stringify({ fetchedAt: advisorySnapshotDate }),
  )
})

afterEach(async () => {
  // restore the environment and remove every temporary directory
  restoreEnvironmentVariables()
  for (const directory of [
    casesDirectory,
    resultsDirectory,
    advisoryCacheDirectory,
    cacheDirectory,
  ]) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('runBenchmark', () => {
  test('runs every case of the split in sorted id order with isOffline true', async () => {
    // run the stub over the dev split, asking for isOffline false
    const stubPipeline = makeStubPipeline()
    await runStubBenchmark({
      stubPipeline,
      reviewOptions: { isOffline: false },
    })

    // the cases ran in id order, every call offline against the advisory fixture
    expect(stubPipeline.calls.map((call) => call.caseId)).toEqual([
      scaCaseId,
      codeCaseId,
      cleanCaseId,
    ])
    for (const call of stubPipeline.calls) {
      expect(call.reviewOptions.isOffline).toBe(true)
      expect(call.reviewOptions.advisoryCacheDir).toBe(advisoryCacheDirectory)
      expect(call.reviewOptions.contextLines).toBe(30)
    }
  })

  test('defaults the advisory cache to the pinned advisory fixture', async () => {
    // run without overriding the advisory cache
    const stubPipeline = makeStubPipeline()
    const results = await runBenchmark({
      pipeline: stubPipeline.pipeline,
      split: 'dev',
      label: runLabel,
      options: {
        casesDirectory,
        resultsDirectory,
        now: makeClock(),
        gitSha: fakeGitSha,
      },
    })

    // every call read the fixture directory and the run is dated by the fixture snapshot
    for (const call of stubPipeline.calls) {
      expect(call.reviewOptions.advisoryCacheDir).toBe(
        benchmarkAdvisoryFixtureDirectory,
      )
    }
    const fixtureSnapshot = await Bun.file(
      join(benchmarkAdvisoryFixtureDirectory, 'snapshot.json'),
    ).json()
    expect(results.advisorySnapshotDate).toBe(fixtureSnapshot.fetchedAt)
  })

  test('scores the canned findings against the labels', async () => {
    // two matches, one extra code-review prediction and one pre-existing secret
    const results = await runStubBenchmark({ stubPipeline: makeStubPipeline() })
    expect(results.score.precision).toBeCloseTo(2 / 3)
    expect(results.score.recall).toBe(1)
    expect(results.score.f1).toBeCloseTo(0.8)
    expect(results.score.falsePositivesOnClean).toBe(0)
    expect(results.score.caseResults).toEqual([
      {
        caseId: scaCaseId,
        truePositives: 1,
        falsePositives: 0,
        falseNegatives: 0,
      },
      {
        caseId: codeCaseId,
        truePositives: 1,
        falsePositives: 1,
        falseNegatives: 0,
      },
      {
        caseId: cleanCaseId,
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
      },
    ])

    // the pre-existing secret is recorded but not scored, and every case completed
    const cleanCaseDetail = results.cases.find(
      (caseDetail) => caseDetail.caseId === cleanCaseId,
    )
    expect(cleanCaseDetail?.preExistingFindings).toHaveLength(1)
    expect(results.cases.map((caseDetail) => caseDetail.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ])
    expect(results.cases).toEqual(results.score.caseDetails)
  })

  test('writes the timestamped and latest json files with equal content', async () => {
    const results = await runStubBenchmark({ stubPipeline: makeStubPipeline() })

    // the four files carry the clock's start time and the label
    const resultsFileNames = await readdir(resultsDirectory)
    resultsFileNames.sort()
    expect(resultsFileNames).toEqual([
      `20261015T201500Z-${runLabel}.html`,
      `20261015T201500Z-${runLabel}.json`,
      'latest-dev.html',
      'latest-dev.json',
    ])

    // both json files parse to the returned results
    const timestampedResults = await Bun.file(
      join(resultsDirectory, `20261015T201500Z-${runLabel}.json`),
    ).json()
    const latestResults = await Bun.file(
      join(resultsDirectory, 'latest-dev.json'),
    ).json()
    expect(timestampedResults).toEqual(latestResults)
    expect(timestampedResults).toEqual(JSON.parse(JSON.stringify(results)))
  })

  test('keeps a label with path characters inside the results directory', async () => {
    // a label holding a slash and a parent directory reference
    await runStubBenchmark({
      stubPipeline: makeStubPipeline(),
      label: '../probe/label',
    })

    // the files sit flat in the results directory under the cleaned label
    const resultsFileNames = await readdir(resultsDirectory)
    resultsFileNames.sort()
    expect(resultsFileNames).toEqual([
      '20261015T201500Z-..-probe-label.html',
      '20261015T201500Z-..-probe-label.json',
      'latest-dev.html',
      'latest-dev.json',
    ])
    expect(existsSync(join(dirname(resultsDirectory), 'probe'))).toBe(false)
  })

  test('records the provenance of the run', async () => {
    const results = await runStubBenchmark({ stubPipeline: makeStubPipeline() })
    expect(results.label).toBe(runLabel)
    expect(results.split).toBe('dev')
    expect(results.startedAt).toBe(runStartedAt.toISOString())
    expect(results.gitSha).toBe(fakeGitSha)
    expect(results.promptVersions).toEqual(cannedPromptVersions)
    expect(results.modelIds).toEqual(cannedModelIds)
    expect(results.advisorySnapshotDate).toBe(advisorySnapshotDate)
    expect(results.isLlmCacheUsed).toBe(true)
    expect(results.warnings).toEqual([])

    // the cache flag follows the review options the run used
    const uncachedResults = await runStubBenchmark({
      stubPipeline: makeStubPipeline(),
      reviewOptions: { isCacheEnabled: false },
    })
    expect(uncachedResults.isLlmCacheUsed).toBe(false)
  })

  test('writes a self-contained page with one row per case and the overall metrics', async () => {
    await runStubBenchmark({ stubPipeline: makeStubPipeline() })
    const pageHtml = await Bun.file(
      join(resultsDirectory, 'latest-dev.html'),
    ).text()

    // one row per case, carrying the attributes the filters read
    for (const caseId of [scaCaseId, codeCaseId, cleanCaseId]) {
      expect(pageHtml).toContain(`data-case="${caseId}"`)
    }
    expect(pageHtml.match(/<tr data-case=/g)).toHaveLength(3)
    expect(pageHtml).toContain('data-category="clean"')
    expect(pageHtml).toContain('data-split="dev"')
    expect(pageHtml).toContain('data-status="completed"')

    // the overall precision, recall and f1 with three decimals
    expect(pageHtml).toContain(
      '<td>overall</td>\n<td class="number">0.667</td>\n<td class="number">1.000</td>\n<td class="number">0.800</td>',
    )

    // the provenance and the filters are on the page, and nothing is loaded from outside
    expect(pageHtml).toContain(fakeGitSha)
    expect(pageHtml).toContain('code-review=v3')
    expect(pageHtml.match(/<select data-filter=/g)).toHaveLength(3)
    expect(pageHtml).not.toContain('<script src=')
    expect(pageHtml).not.toContain('<link ')
  })

  test('marks a case whose pipeline throws as failed and runs the others', async () => {
    const results = await runStubBenchmark({
      stubPipeline: makeStubPipeline({ throwingCaseId: codeCaseId }),
    })

    // the throwing case failed with its message and misses its expected finding
    const failedCaseDetail = results.cases.find(
      (caseDetail) => caseDetail.caseId === codeCaseId,
    )
    expect(failedCaseDetail?.status).toBe('failed')
    expect(failedCaseDetail?.errorMessage).toBe(`stub failure on ${codeCaseId}`)
    expect(failedCaseDetail?.falseNegatives).toBe(1)

    // the other two completed and the score reflects the miss
    const otherStatuses = results.cases
      .filter((caseDetail) => caseDetail.caseId !== codeCaseId)
      .map((caseDetail) => caseDetail.status)
    expect(otherStatuses).toEqual(['completed', 'completed'])
    expect(results.score.precision).toBe(1)
    expect(results.score.recall).toBe(0.5)
  })

  test('skips a git case while offline and leaves it out of the score', async () => {
    // add the git case and forbid the network
    await writeCaseFile(gitCase)
    process.env[offlineEnvironmentVariable] = '1'
    const stubPipeline = makeStubPipeline()
    const results = await runStubBenchmark({ stubPipeline })

    // the git case never reached the pipeline and is recorded as skipped with a warning
    expect(stubPipeline.calls.map((call) => call.caseId)).toEqual([
      scaCaseId,
      codeCaseId,
      cleanCaseId,
    ])
    const skippedCaseDetail = results.cases.find(
      (caseDetail) => caseDetail.caseId === gitCaseId,
    )
    expect(skippedCaseDetail?.status).toBe('skipped')
    expect(skippedCaseDetail?.falseNegatives).toBe(0)
    expect(results.warnings).toHaveLength(1)
    expect(results.warnings[0]).toContain(gitCaseId)
    expect(results.warnings[0]).toContain(unreachableRepoUrl)
    expect(results.warnings[0]).toContain(offlineEnvironmentVariable)

    // the score is the same as without the git case
    expect(results.score.precision).toBeCloseTo(2 / 3)
    expect(results.score.recall).toBe(1)
    expect(results.score.byCategory['real-world']).toBeUndefined()
  })

  test('skips a git case whose clone cannot reach the repository', async () => {
    // add the git case with the network allowed, so the clone itself fails
    await writeCaseFile(gitCase)
    const stubPipeline = makeStubPipeline()
    const results = await runStubBenchmark({ stubPipeline })

    // the case is skipped with the connection failure as the reason, not failed
    const skippedCaseDetail = results.cases.find(
      (caseDetail) => caseDetail.caseId === gitCaseId,
    )
    expect(skippedCaseDetail?.status).toBe('skipped')
    expect(results.warnings).toHaveLength(1)
    expect(results.warnings[0]).toContain(unreachableRepoUrl)
    expect(results.warnings[0]).not.toContain(offlineEnvironmentVariable)
    expect(stubPipeline.calls).toHaveLength(3)
  })
})

// the stub to run, the review options to override and the label to write under
interface RunStubBenchmarkOptions {
  stubPipeline: StubPipeline
  reviewOptions?: Partial<ReviewOptions>
  label?: string
}

// run the stub over the dev split of the temporary corpus with a fixed clock and sha
async function runStubBenchmark({
  stubPipeline,
  reviewOptions = {},
  label = runLabel,
}: RunStubBenchmarkOptions): Promise<BenchmarkRunResults> {
  return runBenchmark({
    pipeline: stubPipeline.pipeline,
    split: 'dev',
    label,
    options: {
      casesDirectory,
      resultsDirectory,
      reviewOptions: {
        advisoryCacheDir: advisoryCacheDirectory,
        ...reviewOptions,
      },
      now: makeClock(),
      gitSha: fakeGitSha,
    },
  })
}

// write a snapshot case: its case.json, the fake app in base/ and the one-line change in head/
async function writeSnapshotCase(benchmarkCase: BenchmarkCase): Promise<void> {
  // write the case file
  const caseDirectory = await writeCaseFile(benchmarkCase)

  // copy the fake app into both trees
  for (const treeName of ['base', 'head']) {
    for (const [relativePath, text] of Object.entries(fakeAppFiles)) {
      await writeTreeFile({
        filePath: join(caseDirectory, treeName, relativePath),
        text,
      })
    }
  }

  // change one line in head
  await writeTreeFile({
    filePath: join(caseDirectory, 'head', 'src/users.ts'),
    text: changedUsersFile,
  })
}

// write a case's case.json into its directory and return the directory
async function writeCaseFile(benchmarkCase: BenchmarkCase): Promise<string> {
  // write case.json under a directory named by the case id
  const caseDirectory = join(casesDirectory, benchmarkCase.id)
  await mkdir(caseDirectory, { recursive: true })
  await Bun.write(
    join(caseDirectory, 'case.json'),
    JSON.stringify(benchmarkCase, null, 2),
  )
  return caseDirectory
}

// the file to write and its text
interface WriteTreeFileOptions {
  filePath: string
  text: string
}

// write one file of a tree, making its directory first
async function writeTreeFile({
  filePath,
  text,
}: WriteTreeFileOptions): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await Bun.write(filePath, text)
}
