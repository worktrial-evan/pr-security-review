// tests the dedupe of model findings: overlapping duplicates, ties, distinct findings kept, a broad finding beaten by a narrower one, a weak bridge, the output order, an empty input and the input left as it was
import { describe, expect, test } from 'bun:test'
import { dedupeFindings } from './dedupe-findings'
import { sqlInjectionModelFinding } from './fixtures/model-findings'
import type { ModelFinding } from './model-output'

// return the sql injection finding with some fields replaced
function buildFinding(overrides: Partial<ModelFinding>): ModelFinding {
  return { ...sqlInjectionModelFinding, ...overrides }
}

// five distinct findings in output order: by file, then start line, then end line, then vulnerabilityType
const orderedFindings: ModelFinding[] = [
  buildFinding({
    file: 'a.ts',
    startLine: 1,
    endLine: 2,
    vulnerabilityType: 'CWE-20',
  }),
  buildFinding({
    file: 'a.ts',
    startLine: 1,
    endLine: 2,
    vulnerabilityType: 'CWE-79',
  }),
  buildFinding({
    file: 'a.ts',
    startLine: 1,
    endLine: 3,
    vulnerabilityType: 'CWE-89',
  }),
  buildFinding({
    file: 'a.ts',
    startLine: 5,
    endLine: 5,
    vulnerabilityType: 'CWE-89',
  }),
  buildFinding({
    file: 'b.ts',
    startLine: 1,
    endLine: 1,
    vulnerabilityType: 'CWE-89',
  }),
]

describe('dedupeFindings', () => {
  test('keeps the higher confidence of two overlapping findings with the same file and vulnerabilityType, whatever the input order', () => {
    // two overlapping findings on the same vulnerabilityType, the second more confident
    const weakFinding = buildFinding({
      startLine: 12,
      endLine: 13,
      confidence: 0.6,
    })
    const strongFinding = buildFinding({
      startLine: 13,
      endLine: 14,
      confidence: 0.9,
    })

    expect(dedupeFindings([weakFinding, strongFinding])).toEqual([
      strongFinding,
    ])
    expect(dedupeFindings([strongFinding, weakFinding])).toEqual([
      strongFinding,
    ])
  })

  test('keeps the earlier finding in position order when the confidences tie', () => {
    // two overlapping findings at the same confidence, told apart by their titles
    const firstFinding = buildFinding({
      startLine: 12,
      endLine: 13,
      confidence: 0.8,
      title: 'first',
    })
    const secondFinding = buildFinding({
      startLine: 13,
      endLine: 14,
      confidence: 0.8,
      title: 'second',
    })

    expect(dedupeFindings([secondFinding, firstFinding])).toEqual([
      firstFinding,
    ])
  })

  test('keeps the finding reported first alone when two are equal in file, range, vulnerabilityType and confidence', () => {
    // two findings equal in every ordering field and in confidence, told apart by their titles
    const firstFinding = buildFinding({ title: 'reported first' })
    const secondFinding = buildFinding({ title: 'reported second' })

    expect(dedupeFindings([firstFinding, secondFinding])).toEqual([
      firstFinding,
    ])
    expect(dedupeFindings([secondFinding, firstFinding])).toEqual([
      secondFinding,
    ])
  })

  test('keeps both findings when the vulnerabilityType differs on the same range', () => {
    // the same range reported as sql injection and as command injection
    const sqlInjectionFinding = buildFinding({ vulnerabilityType: 'CWE-89' })
    const commandInjectionFinding = buildFinding({
      vulnerabilityType: 'CWE-78',
    })

    expect(
      dedupeFindings([sqlInjectionFinding, commandInjectionFinding]),
    ).toEqual([commandInjectionFinding, sqlInjectionFinding])
  })

  test('keeps both findings when the same vulnerabilityType has ranges that do not overlap', () => {
    // two ranges on the same vulnerabilityType that end and start on neighbouring lines
    const earlyFinding = buildFinding({ startLine: 1, endLine: 3 })
    const lateFinding = buildFinding({ startLine: 4, endLine: 6 })

    expect(dedupeFindings([lateFinding, earlyFinding])).toEqual([
      earlyFinding,
      lateFinding,
    ])
  })

  test('keeps both findings when the same vulnerabilityType and range are in another file', () => {
    // the same range and vulnerabilityType in two files
    const usersFinding = buildFinding({ file: 'src/users.ts' })
    const ordersFinding = buildFinding({ file: 'src/orders.ts' })

    expect(dedupeFindings([usersFinding, ordersFinding])).toEqual([
      ordersFinding,
      usersFinding,
    ])
  })

  test('treats ranges that share an end line as overlapping', () => {
    // two ranges that meet on line 3, the second more confident
    const firstFinding = buildFinding({
      startLine: 1,
      endLine: 3,
      confidence: 0.7,
    })
    const secondFinding = buildFinding({
      startLine: 3,
      endLine: 5,
      confidence: 0.8,
    })

    expect(dedupeFindings([firstFinding, secondFinding])).toEqual([
      secondFinding,
    ])
  })

  test('keeps only the narrow finding that beats a broad one, and drops the weak finding the broad one overlapped', () => {
    // a broad finding, a narrower and more confident one inside it, and a weak one the broad one covers
    const broadFinding = buildFinding({
      startLine: 1,
      endLine: 10,
      confidence: 0.9,
    })
    const narrowFinding = buildFinding({
      startLine: 2,
      endLine: 3,
      confidence: 0.95,
    })
    const weakFinding = buildFinding({
      startLine: 5,
      endLine: 6,
      confidence: 0.5,
    })

    expect(dedupeFindings([weakFinding, broadFinding, narrowFinding])).toEqual([
      narrowFinding,
    ])
  })

  test('drops a weak bridge that overlaps two strong findings and keeps both of them', () => {
    // two strong findings joined by a weak one that overlaps each of them
    const firstStrongFinding = buildFinding({
      startLine: 1,
      endLine: 3,
      confidence: 0.9,
    })
    const bridgeFinding = buildFinding({
      startLine: 3,
      endLine: 5,
      confidence: 0.5,
    })
    const secondStrongFinding = buildFinding({
      startLine: 5,
      endLine: 7,
      confidence: 0.9,
    })

    expect(
      dedupeFindings([bridgeFinding, secondStrongFinding, firstStrongFinding]),
    ).toEqual([firstStrongFinding, secondStrongFinding])
  })

  test('keeps both ends of a chain of equal confidence and drops only the bridge', () => {
    // three adjacent findings at the same confidence, the middle one overlapping both others
    const firstFinding = buildFinding({ startLine: 1, endLine: 3 })
    const bridgeFinding = buildFinding({ startLine: 3, endLine: 5 })
    const lastFinding = buildFinding({ startLine: 5, endLine: 7 })

    expect(dedupeFindings([lastFinding, bridgeFinding, firstFinding])).toEqual([
      firstFinding,
      lastFinding,
    ])
  })

  test('orders the output by file, then start line, then end line, then vulnerabilityType', () => {
    const reversedFindings = [...orderedFindings].reverse()

    expect(dedupeFindings(reversedFindings)).toEqual(orderedFindings)
  })

  test('orders vulnerabilityType ids by code unit, so CWE-1321 comes before CWE-20 on the same range', () => {
    // the same range reported as prototype pollution and as improper input validation
    const prototypePollutionFinding = buildFinding({
      vulnerabilityType: 'CWE-1321',
    })
    const inputValidationFinding = buildFinding({ vulnerabilityType: 'CWE-20' })

    expect(
      dedupeFindings([inputValidationFinding, prototypePollutionFinding]),
    ).toEqual([prototypePollutionFinding, inputValidationFinding])
  })

  test('returns an empty array for an empty input', () => {
    expect(dedupeFindings([])).toEqual([])
  })

  test('leaves the input array as it was', () => {
    // two findings given out of position order
    const lateFinding = buildFinding({ startLine: 4, endLine: 6 })
    const earlyFinding = buildFinding({ startLine: 1, endLine: 3 })
    const findings = [lateFinding, earlyFinding]

    dedupeFindings(findings)

    expect(findings).toEqual([lateFinding, earlyFinding])
  })
})
