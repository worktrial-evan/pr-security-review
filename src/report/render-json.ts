// renders a ReviewResult as the JSON report for CI, validated through its schema
import { type ReviewResult, reviewResultSchema } from '../shared/review'

// the spaces of indentation in the JSON report
const jsonIndentation = 2

/**
 * Validates a review result through its schema and returns it as indented JSON. Throws when the result is invalid.
 */
export function renderJsonReport(result: ReviewResult): string {
  const validatedResult = reviewResultSchema.parse(result)
  return JSON.stringify(validatedResult, null, jsonIndentation)
}
