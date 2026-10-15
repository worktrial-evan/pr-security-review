// tests that the JSON report round-trips through the schema and refuses an invalid result
import { describe, expect, test } from 'bun:test'
import type { ReviewResult } from '../shared/review'
import { reviewResultSchema } from '../shared/review'
import { fixtureReviewResult } from './fixtures/review-result'
import { renderJsonReport } from './render-json'

describe('renderJsonReport', () => {
  test('round-trips the fixture through the review result schema', () => {
    const json = renderJsonReport(fixtureReviewResult)
    const parsedResult = reviewResultSchema.parse(JSON.parse(json))
    expect(parsedResult).toEqual(fixtureReviewResult)
  })

  test('keeps every finding id in the output', () => {
    const json = renderJsonReport(fixtureReviewResult)
    for (const finding of fixtureReviewResult.findings) {
      expect(json).toContain(finding.id)
    }
  })

  test('throws for a result that does not validate', () => {
    // set a confidence outside 0 to 1 on the first finding
    const findings = fixtureReviewResult.findings.map((finding, index) =>
      index === 0 ? { ...finding, confidence: 1.5 } : finding,
    )
    const invalidResult: ReviewResult = { ...fixtureReviewResult, findings }
    expect(() => renderJsonReport(invalidResult)).toThrow()
  })
})
