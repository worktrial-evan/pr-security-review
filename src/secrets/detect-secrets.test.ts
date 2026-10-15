// tests the detector: added lines only, the allowlists, one finding per value, fingerprints, ids, and that the value never appears in a finding

import { describe, expect, test } from 'bun:test'
import { findingSchema } from '@/shared/finding'
import type { ChangedFile } from '@/shared/pull-request-source'
import { detectSecrets } from './detect-secrets'

// values built inside the test so no realistic credential is committed
const githubToken = `ghp_${'Ab3dE5gH'.repeat(4)}Ab3d`
const awsAccessKeyId = `AKIA${'ABCDEFGH'.repeat(2)}`
const genericValue = 'q7Zk2mXp9LrT4vBn8WcY5hJd'

// a changed file whose added lines are the given texts, numbered from 1
function createChangedFile(path: string, texts: string[]): ChangedFile {
  return {
    path,
    status: 'added',
    hunks: [],
    addedLines: texts.map((text, index) => ({ line: index + 1, text })),
    isBinary: false,
  }
}

describe('detectSecrets', () => {
  test('flags a token on an added line with its file, line and rule', () => {
    const changedFile = createChangedFile('src/config.ts', [
      'const name = "app"',
      `const token = '${githubToken}'`,
    ])
    const [secretFinding, ...otherFindings] = detectSecrets({
      changedFiles: [changedFile],
    })

    expect(otherFindings).toEqual([])
    expect(secretFinding?.detector).toBe('secrets')
    expect(secretFinding?.ruleId).toBe('github-token')
    expect(secretFinding?.file).toBe('src/config.ts')
    expect(secretFinding?.startLine).toBe(2)
    expect(secretFinding?.endLine).toBe(2)
    expect(secretFinding?.isIntroducedByPullRequest).toBe(true)
    expect(secretFinding?.fingerprint).toMatch(/^[0-9a-f]{12}$/)
  })

  test('ignores a token that is only in a removed or context line', () => {
    const changedFile: ChangedFile = {
      ...createChangedFile('src/config.ts', ['const name = "app"']),
      status: 'modified',
      hunks: [
        {
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 1,
          lines: [
            {
              kind: 'removed',
              headLine: 1,
              text: `const token = '${githubToken}'`,
            },
            { kind: 'context', headLine: 1, text: `// ${githubToken}` },
            { kind: 'added', headLine: 1, text: 'const name = "app"' },
          ],
        },
      ],
    }

    expect(detectSecrets({ changedFiles: [changedFile] })).toEqual([])
  })

  test('returns nothing for a file with no added lines', () => {
    const changedFile = createChangedFile('assets/logo.png', [])
    expect(detectSecrets({ changedFiles: [changedFile] })).toEqual([])
  })

  test('skips a placeholder value', () => {
    const placeholderKeyId = `AKIA${'0'.repeat(10)}EXAMPLE`
    const changedFile = createChangedFile('src/aws.ts', [
      `const keyId = '${placeholderKeyId}'`,
    ])
    expect(detectSecrets({ changedFiles: [changedFile] })).toEqual([])
  })

  test('skips fixture files and example env files', () => {
    const line = `TOKEN=${githubToken}`
    const changedFiles = [
      createChangedFile('test/fixtures/config.env', [line]),
      createChangedFile('.env.example', [line]),
    ]
    expect(detectSecrets({ changedFiles })).toEqual([])
  })

  test('skips a line that ends in a secrets-allow comment', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const token = '${githubToken}' // secrets-allow`,
    ])
    expect(detectSecrets({ changedFiles: [changedFile] })).toEqual([])
  })

  test('flags a high-entropy generic assignment', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const client_secret = '${genericValue}'`,
    ])
    const secretFindings = detectSecrets({ changedFiles: [changedFile] })
    expect(secretFindings.map((finding) => finding.ruleId)).toEqual([
      'generic-secret',
    ])
  })

  test.each([
    ['a short value', 'const client_secret = "short"'],
    ['a repeated character', `const client_secret = "${'a'.repeat(20)}"`],
    ['a repeated pattern', `const client_secret = "${'ab'.repeat(10)}"`],
  ])('does not flag %s in a generic assignment', (_name, line) => {
    const changedFile = createChangedFile('src/config.ts', [line])
    expect(detectSecrets({ changedFiles: [changedFile] })).toEqual([])
  })

  test('reports a value that fits a specific and the generic rule once, under the specific rule', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const github_token = '${githubToken}'`,
    ])
    const secretFindings = detectSecrets({ changedFiles: [changedFile] })
    expect(secretFindings.map((finding) => finding.ruleId)).toEqual([
      'github-token',
    ])
  })

  test('reports two different values on one line as two findings', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const pair = ['${githubToken}', '${awsAccessKeyId}']`,
    ])
    const secretFindings = detectSecrets({ changedFiles: [changedFile] })
    expect(secretFindings.map((finding) => finding.ruleId)).toEqual([
      'aws-access-key-id',
      'github-token',
    ])
  })

  test('gives equal values equal fingerprints and different lines different ids', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const first = '${githubToken}'`,
      `const second = '${githubToken}'`,
    ])
    const [firstFinding, secondFinding] = detectSecrets({
      changedFiles: [changedFile],
    })

    expect(firstFinding?.fingerprint).toBe(secondFinding?.fingerprint)
    expect(firstFinding?.id).not.toBe(secondFinding?.id)
  })

  test('fingerprints the first 12 hex characters of the sha256 of the value', () => {
    const hasher = new Bun.CryptoHasher('sha256')
    hasher.update(githubToken)
    const expectedFingerprint = hasher.digest('hex').slice(0, 12)

    const changedFile = createChangedFile('src/config.ts', [
      `const token = '${githubToken}'`,
    ])
    const [secretFinding] = detectSecrets({ changedFiles: [changedFile] })
    expect(secretFinding?.fingerprint).toBe(expectedFingerprint)
  })

  test('returns the same findings in the same order on every run', () => {
    const changedFiles = [
      createChangedFile('a.ts', [`x = '${githubToken}'`]),
      createChangedFile('b.ts', [`y = '${awsAccessKeyId}'`]),
    ]
    const firstRun = detectSecrets({ changedFiles })
    const secondRun = detectSecrets({ changedFiles })

    expect(secondRun).toEqual(firstRun)
    expect(firstRun.map((finding) => finding.file)).toEqual(['a.ts', 'b.ts'])
  })

  test('never holds the value or the line text in a finding or its JSON', () => {
    const lineText = `const token = '${githubToken}'`
    const changedFile = createChangedFile('src/config.ts', [
      lineText,
      `const key = '${awsAccessKeyId}'`,
      `const client_secret = '${genericValue}'`,
    ])
    const secretFindings = detectSecrets({ changedFiles: [changedFile] })
    const findingsJson = JSON.stringify(secretFindings)

    expect(secretFindings).toHaveLength(3)
    for (const value of [githubToken, awsAccessKeyId, genericValue, lineText]) {
      expect(findingsJson).not.toContain(value)
      for (const secretFinding of secretFindings) {
        expect(Object.values(secretFinding)).not.toContain(value)
      }
    }
  })

  test('returns findings that pass the shared finding schema', () => {
    const changedFile = createChangedFile('src/config.ts', [
      `const token = '${githubToken}'`,
      `const client_secret = '${genericValue}'`,
    ])
    const secretFindings = detectSecrets({ changedFiles: [changedFile] })

    expect(secretFindings).toHaveLength(2)
    for (const secretFinding of secretFindings) {
      expect(findingSchema.parse(secretFinding)).toEqual(secretFinding)
    }
  })
})
