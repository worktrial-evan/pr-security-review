// tests the CVSS 3.x base score against scores published by the CVSS 3.1 calculator
import { describe, expect, test } from 'bun:test'
import { computeCvss3BaseScore } from './cvss'

describe('computeCvss3BaseScore', () => {
  // vectors paired with the score the official calculator gives
  const scoredVectors: [string, number][] = [
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10],
    ['CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N', 6.5],
    ['CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H', 8.1],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
    ['CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N', 5.5],
    ['CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', 0],
  ]

  test.each(scoredVectors)('scores %s as %d', (vector, expectedScore) => {
    expect(computeCvss3BaseScore(vector)).toBe(expectedScore)
  })

  test('ignores temporal metrics after the base metrics', () => {
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O'
    expect(computeCvss3BaseScore(vector)).toBe(9.8)
  })

  test('returns undefined for a CVSS v4 vector', () => {
    const vector =
      'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'
    expect(computeCvss3BaseScore(vector)).toBeUndefined()
  })

  test('returns undefined when a base metric is missing or unknown', () => {
    expect(
      computeCvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H'),
    ).toBeUndefined()
    expect(
      computeCvss3BaseScore('CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'),
    ).toBeUndefined()
  })
})
