// turns thrown values and zod errors into the one-line messages the corpus problems and run warnings carry
import type { z } from 'zod'

/**
 * Returns the message of a thrown value, or its string form when it is not an Error.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Returns a zod error as one line naming each failing path and its message.
 */
export function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join(', ')
}
