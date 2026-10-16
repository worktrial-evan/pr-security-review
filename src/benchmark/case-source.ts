// opens the pull request source of one benchmark case: a snapshot source over its trees or a git source over its shas, with an unreachable repository classified as a skip
import { join } from 'node:path'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import type { PullRequestSource } from '@/shared/pull-request-source'
import {
  OfflineCloneError,
  openBenchmarkRepository,
} from './benchmark-repository'
import type { LoadedBenchmarkCase } from './cases'
import { describeError } from './error-messages'

// the outcome of opening a case's pull request source
export type PullRequestSourceOpen =
  | { kind: 'opened'; pullRequestSource: PullRequestSource }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; errorMessage: string }

// the case to open a source for and where git cases clone to
export interface OpenPullRequestSourceOptions {
  loadedCase: LoadedBenchmarkCase
  cacheDirectory: string
}

/**
 * Opens a snapshot source over the case's trees, or a git source over the case's shas, skipping an unreachable repository and failing on any other error.
 */
export async function openPullRequestSource({
  loadedCase,
  cacheDirectory,
}: OpenPullRequestSourceOptions): Promise<PullRequestSourceOpen> {
  // a snapshot case holds its two trees beside its case.json
  const { benchmarkCase, caseDirectory } = loadedCase
  if (benchmarkCase.source.kind === 'snapshot') {
    return {
      kind: 'opened',
      pullRequestSource: new SnapshotPullRequestSource({
        baseDirectory: join(caseDirectory, 'base'),
        headDirectory: join(caseDirectory, 'head'),
      }),
    }
  }

  // a git case clones into the cache. an unreachable repository skips the case, any other failure fails it
  const { repositoryUrl, baseSha, headSha } = benchmarkCase.source
  try {
    const pullRequestSource = await openBenchmarkRepository({
      repositoryUrl,
      baseSha,
      headSha,
      cacheDirectory,
    })
    return { kind: 'opened', pullRequestSource }
  } catch (error) {
    if (error instanceof OfflineCloneError) {
      return { kind: 'skipped', reason: error.message }
    }
    return { kind: 'failed', errorMessage: describeError(error) }
  }
}
