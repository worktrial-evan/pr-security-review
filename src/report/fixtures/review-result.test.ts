// tests that the fixture review result is valid, large enough and covers every enum value
import { describe, expect, test } from 'bun:test'
import { dependencyScopes } from '@/shared/dependency'
import {
  detectorKinds,
  matcherAgreements,
  reachabilityKinds,
  severities,
  summarySources,
} from '@/shared/finding'
import { reviewResultSchema } from '@/shared/review'
import { fixtureReviewResult } from './review-result'

describe('fixtureReviewResult', () => {
  test('parses through the review result schema unchanged', () => {
    const parsedResult = reviewResultSchema.parse(fixtureReviewResult)
    expect(parsedResult).toEqual(fixtureReviewResult)
  })

  test('has at least 25 findings with unique ids and a step error', () => {
    const findingIds = fixtureReviewResult.findings.map(({ id }) => id)
    expect(findingIds.length).toBeGreaterThanOrEqual(25)
    expect(new Set(findingIds).size).toBe(findingIds.length)
    expect(fixtureReviewResult.errors.length).toBeGreaterThanOrEqual(1)
  })

  test('covers every value of every enum and both booleans', () => {
    const { findings } = fixtureReviewResult

    // collect the values each enum field takes across all findings
    const valuesOf = (
      read: (finding: (typeof findings)[number]) => unknown,
    ): Set<unknown> => new Set(findings.map(read))
    expect(valuesOf((finding) => finding.detector)).toEqual(
      new Set(detectorKinds),
    )
    expect(valuesOf((finding) => finding.severity)).toEqual(new Set(severities))

    // the dependency-only and optional fields are read through a loose record
    const looseValuesOf = (key: string): Set<unknown> =>
      new Set(
        findings
          .map((finding) => (finding as Record<string, unknown>)[key])
          .filter((value) => value !== undefined),
      )
    expect(looseValuesOf('dependencyScope')).toEqual(new Set(dependencyScopes))
    expect(looseValuesOf('reachability')).toEqual(new Set(reachabilityKinds))
    expect(looseValuesOf('matcherAgreement')).toEqual(
      new Set(matcherAgreements),
    )
    expect(looseValuesOf('summarySource')).toEqual(new Set(summarySources))
    expect(looseValuesOf('isGithubReviewed')).toEqual(new Set([true, false]))
    expect(looseValuesOf('isIntroducedByPullRequest')).toEqual(
      new Set([true, false]),
    )
  })
})
