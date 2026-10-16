// the describe step: reads the base and head sha and the pull request reference from the source
import type {
  PullRequestDescription,
  PullRequestSource,
} from '@/shared/pull-request-source'
import { pullRequestDescriptionSchema } from '@/shared/pull-request-source'

/**
 * Describes the pull request and checks the description against the contract.
 */
export async function describePullRequest(
  pullRequestSource: PullRequestSource,
): Promise<PullRequestDescription> {
  const pullRequestDescription = await pullRequestSource.describe()
  return pullRequestDescriptionSchema.parse(pullRequestDescription)
}
