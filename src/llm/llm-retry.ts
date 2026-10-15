// retries a provider call that failed with http 429 or a 5xx status, waiting longer before each retry
import { LlmHttpError } from './llm-provider'

// the wait before each retry. three entries means at most three retries
export const llmRetryDelaysMs = [500, 1000, 2000] as const

// the call to retry and how to wait between attempts
export interface RetryTransientHttpErrorsOptions<T> {
  operation: () => Promise<T>
  sleep: (milliseconds: number) => Promise<void>
}

/**
 * Runs an operation and retries it on 429 and 5xx errors up to three times.
 */
export function retryTransientHttpErrors<T>({
  operation,
  sleep,
}: RetryTransientHttpErrorsOptions<T>): Promise<T> {
  return runAttempt({ operation, sleep, attemptIndex: 0 })
}

/**
 * Returns true for an http error worth retrying: 429 or any 5xx status.
 */
export function isTransientHttpError(error: unknown): boolean {
  // only provider http errors have a status to judge
  if (!(error instanceof LlmHttpError)) {
    return false
  }

  // a rate limit or a server error passes
  return (
    error.statusCode === 429 ||
    (error.statusCode >= 500 && error.statusCode <= 599)
  )
}

// the operation and the zero based index of this attempt
interface RunAttemptOptions<T> extends RetryTransientHttpErrorsOptions<T> {
  attemptIndex: number
}

// run one attempt, then wait and run the next on a transient error
async function runAttempt<T>({
  operation,
  sleep,
  attemptIndex,
}: RunAttemptOptions<T>): Promise<T> {
  // run the operation and return its value on success
  try {
    return await operation()
  } catch (error) {
    // rethrow a permanent error or the last transient one
    const retryDelayMs = llmRetryDelaysMs[attemptIndex]
    if (!isTransientHttpError(error) || retryDelayMs === undefined) {
      throw error
    }

    // wait, then try again
    await sleep(retryDelayMs)
    return runAttempt({ operation, sleep, attemptIndex: attemptIndex + 1 })
  }
}
