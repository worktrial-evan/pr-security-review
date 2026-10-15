// tests for the finding contract: one round trip per variant, the confidence bounds, the id brand and the id derivation
import { describe, expect, test } from 'bun:test'
import { createFindingId, type FindingId, findingSchema } from './finding'
import {
  codeReviewFindingSample,
  scaFindingSample,
  secretFindingSample,
} from './finding.samples'

describe('findingSchema', () => {
  test('an sca finding round-trips', () => {
    expect(findingSchema.parse(scaFindingSample)).toEqual(scaFindingSample)
  })

  test('a code-review finding round-trips', () => {
    expect(findingSchema.parse(codeReviewFindingSample)).toEqual(
      codeReviewFindingSample,
    )
  })

  test('a secret finding round-trips', () => {
    expect(findingSchema.parse(secretFindingSample)).toEqual(
      secretFindingSample,
    )
  })

  test('a confidence of 1.5 is rejected', () => {
    // push the confidence past its upper bound
    const outOfRangeFinding = { ...scaFindingSample, confidence: 1.5 }
    expect(() => findingSchema.parse(outOfRangeFinding)).toThrow(/confidence/)
  })

  test('a variant field is required on its own member only', () => {
    // drop the rule id from the secret finding
    const { ruleId: _ruleId, ...secretFindingWithoutRuleId } =
      secretFindingSample
    expect(() => findingSchema.parse(secretFindingWithoutRuleId)).toThrow(
      /ruleId/,
    )

    // a rule id on a code-review finding is not required there
    expect(() =>
      findingSchema.parse({ ...codeReviewFindingSample, ruleId: 'x' }),
    ).not.toThrow()
  })

  test('a parsed id keeps the finding id brand', () => {
    // @ts-expect-error a plain string lacks the finding id brand
    const plainStringAsId: FindingId = '0123456789abcdef'

    // read the id back from a parsed finding as a branded id
    const parsedFinding = findingSchema.parse(scaFindingSample)
    const parsedId: FindingId = parsedFinding.id
    expect(parsedId).toBe(scaFindingSample.id)
    expect(plainStringAsId.length).toBe(16)
  })
})

describe('createFindingId', () => {
  test('the same detector and stable key give the same id', () => {
    // derive the id twice from the same input
    const firstId = createFindingId({
      detector: 'sca',
      stableKey: 'lodash@4.17.20:GHSA-1',
    })
    const secondId = createFindingId({
      detector: 'sca',
      stableKey: 'lodash@4.17.20:GHSA-1',
    })
    expect(firstId).toBe(secondId)
  })

  test('a different detector gives a different id', () => {
    // derive the id under two detectors from the same stable key
    const scaId = createFindingId({ detector: 'sca', stableKey: 'same-key' })
    const secretsId = createFindingId({
      detector: 'secrets',
      stableKey: 'same-key',
    })
    expect(scaId).not.toBe(secretsId)
  })

  test('an id is 16 lowercase hex characters', () => {
    // derive one id and check its shape
    const findingId = createFindingId({
      detector: 'code-review',
      stableKey: 'src/users.ts:42',
    })
    expect(findingId).toMatch(/^[0-9a-f]{16}$/)
  })
})
