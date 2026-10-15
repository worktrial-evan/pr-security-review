// tests the rule table with one positive and one negative line per rule, built from pieces so no realistic credential is committed

import { describe, expect, test } from 'bun:test'
import { secretRules } from './rules'

// repeat a short piece until it fills the length, so the values below are built inside the test
function buildValue(piece: string, length: number): string {
  return piece.repeat(Math.ceil(length / piece.length)).slice(0, length)
}

// the values the lines below embed
const mixedPiece = 'Ab3dE5gH'
const randomValue = 'q7Zk2mXp9LrT4vBn8WcY5hJd'

// one positive and one negative line for each rule
const ruleCases = [
  {
    ruleId: 'aws-access-key-id',
    positiveLine: `const keyId = '${`AKIA${buildValue('ABCDEFGH', 16)}`}'`,
    negativeLine: `const keyId = '${`AKIA${buildValue('ABCDEFGH', 15)}`}'`,
  },
  {
    ruleId: 'aws-secret-access-key',
    positiveLine: `const awsSecretAccessKey = '${buildValue(mixedPiece, 40)}'`,
    negativeLine: `const awsSecretAccessKey = '${buildValue(mixedPiece, 39)}'`,
  },
  {
    ruleId: 'github-token',
    positiveLine: `const value = '${`ghp_${buildValue(mixedPiece, 36)}`}'`,
    negativeLine: `const value = '${`ghp_${buildValue(mixedPiece, 35)}`}'`,
  },
  {
    ruleId: 'slack-token',
    positiveLine: `const value = '${'xoxb-' + '1234567890-abcdefghij'}'`,
    negativeLine: `const value = '${'xoxz-' + '1234567890-abcdefghij'}'`,
  },
  {
    ruleId: 'stripe-live-key',
    positiveLine: `const value = '${`sk_live_${buildValue(mixedPiece, 24)}`}'`,
    negativeLine: `const value = '${`sk_test_${buildValue(mixedPiece, 24)}`}'`,
  },
  {
    ruleId: 'google-api-key',
    positiveLine: `const value = '${`AIza${buildValue(mixedPiece, 35)}`}'`,
    negativeLine: `const value = '${`AIza${buildValue(mixedPiece, 34)}`}'`,
  },
  {
    ruleId: 'private-key',
    positiveLine: `const value = '${'-----BEGIN RSA PRIVATE' + ' KEY-----'}'`,
    negativeLine: `const value = '${'-----BEGIN PUBLIC' + ' KEY-----'}'`,
  },
  {
    ruleId: 'jwt',
    positiveLine: `const value = '${'eyJ' + 'hbGciOiJIUzI1'}.${'eyJ' + 'zdWIiOiIxMjM0'}.${'c2lnbmF0dXJl'}'`,
    negativeLine: `const value = '${'eyJ' + 'hbGciOiJIUzI1'}.${'eyJ' + 'zdWIiOiIxMjM0'}'`,
  },
  {
    ruleId: 'generic-secret',
    positiveLine: `const client_secret = '${randomValue}'`,
    negativeLine: `const client_color = '${randomValue}'`,
  },
]

// the values a rule's pattern captures on a line
function findValues(ruleId: string, line: string): string[] {
  const rule = secretRules.find((secretRule) => secretRule.ruleId === ruleId)
  if (!rule) {
    throw new Error(`no rule named ${ruleId}`)
  }
  const matches = [...line.matchAll(rule.pattern)]
  return matches.map((match) => match[rule.valueGroup] ?? '')
}

describe('secretRules', () => {
  test('has one case for every rule', () => {
    const ruleIds = secretRules.map((rule) => rule.ruleId)
    expect(ruleCases.map((ruleCase) => ruleCase.ruleId)).toEqual(ruleIds)
  })

  test('puts the generic rule last and gives every rule a severity and a confidence', () => {
    expect(secretRules.at(-1)?.ruleId).toBe('generic-secret')
    for (const rule of secretRules) {
      expect(rule.severity).toBeString()
      expect(rule.confidence).toBeGreaterThan(0)
      expect(rule.confidence).toBeLessThanOrEqual(1)
    }
  })

  test.each(ruleCases)('$ruleId matches its positive line', (ruleCase) => {
    const values = findValues(ruleCase.ruleId, ruleCase.positiveLine)
    expect(values).toHaveLength(1)
    expect(values[0]).not.toBe('')
  })

  test.each(ruleCases)('$ruleId ignores its negative line', (ruleCase) => {
    expect(findValues(ruleCase.ruleId, ruleCase.negativeLine)).toEqual([])
  })

  test.each(['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'])(
    'github-token matches the %s prefix',
    (prefix) => {
      const line = `value = '${prefix + buildValue(mixedPiece, 36)}'`
      expect(findValues('github-token', line)).toHaveLength(1)
    },
  )

  test('github-token matches a fine-grained token', () => {
    const line = `value = '${`github_pat_${buildValue(mixedPiece, 82)}`}'`
    expect(findValues('github-token', line)).toHaveLength(1)
  })

  test.each(['api_key', 'apikey', 'password', 'auth_token'])(
    'generic-secret matches a key named %s',
    (keyName) => {
      const line = `${keyName}: "${randomValue}"`
      expect(findValues('generic-secret', line)).toEqual([randomValue])
    },
  )
})
