// tests the grounding filter: a grounded finding, each rejection reason, exact evidence matching, near-miss vulnerabilityType ids and the order of the reasons
import { describe, expect, test } from 'bun:test'
import { sqlInjectionChangedFile } from './fixtures/changed-files'
import { sqlInjectionModelFinding } from './fixtures/model-findings'
import { type GroundingVerdict, groundFinding } from './grounding'
import type { ModelFinding } from './model-output'

// the file the chunk under review belongs to and the lines the pull request added to it, on head lines 14 and 15
const reviewedFile = sqlInjectionChangedFile.path
const addedLines = sqlInjectionChangedFile.addedLines

// the vulnerabilityType ids that almost spell the allowed CWE-89. one is lowercase, one has a trailing space, one has a leading zero and one has the name appended
const nearMissVulnerabilityTypeIds = [
  'cwe-89',
  'CWE-89 ',
  'CWE-089',
  'CWE-89: SQL Injection',
]

// ground a finding built from the sample finding with some fields replaced
function groundVariant(overrides: Partial<ModelFinding>): GroundingVerdict {
  return groundFinding({
    finding: { ...sqlInjectionModelFinding, ...overrides },
    file: reviewedFile,
    addedLines,
  })
}

describe('groundFinding', () => {
  test('grounds a finding whose evidence and range are added lines and whose vulnerabilityType is allowed', () => {
    expect(groundVariant({})).toEqual({ kind: 'grounded' })
  })

  test('rejects a fabricated evidence line', () => {
    expect(
      groundVariant({
        evidence: [
          ...sqlInjectionModelFinding.evidence,
          '  await database.query("DROP TABLE users")',
        ],
      }),
    ).toEqual({ kind: 'rejected', reason: 'evidence-not-added' })
  })

  test('rejects a trimmed copy of an added line', () => {
    // strip the leading indentation from each evidence line
    const trimmedEvidence = sqlInjectionModelFinding.evidence.map(
      (evidenceLine) => evidenceLine.trimStart(),
    )

    expect(groundVariant({ evidence: trimmedEvidence })).toEqual({
      kind: 'rejected',
      reason: 'evidence-not-added',
    })
  })

  test('rejects a range that covers only context lines', () => {
    expect(groundVariant({ startLine: 12, endLine: 13 })).toEqual({
      kind: 'rejected',
      reason: 'range-not-added',
    })
  })

  test('rejects a range whose start is after its end', () => {
    expect(groundVariant({ startLine: 15, endLine: 14 })).toEqual({
      kind: 'rejected',
      reason: 'range-not-added',
    })
  })

  test('grounds a range that touches one added line among context lines', () => {
    expect(groundVariant({ startLine: 12, endLine: 14 })).toEqual({
      kind: 'grounded',
    })
  })

  test('rejects a vulnerabilityType outside the allowlist', () => {
    expect(groundVariant({ vulnerabilityType: 'CWE-9999' })).toEqual({
      kind: 'rejected',
      reason: 'vulnerability-type-not-allowed',
    })
  })

  test.each(nearMissVulnerabilityTypeIds)(
    'rejects the near-miss vulnerabilityType id %j',
    (nearMissVulnerabilityTypeId) => {
      expect(
        groundVariant({ vulnerabilityType: nearMissVulnerabilityTypeId }),
      ).toEqual({
        kind: 'rejected',
        reason: 'vulnerability-type-not-allowed',
      })
    },
  )

  test('rejects a finding that names another file', () => {
    expect(groundVariant({ file: 'src/other.ts' })).toEqual({
      kind: 'rejected',
      reason: 'file-mismatch',
    })
  })
})

describe('groundFinding reason order', () => {
  test('reports file-mismatch before vulnerability-type-not-allowed', () => {
    expect(
      groundVariant({ file: 'src/other.ts', vulnerabilityType: 'CWE-9999' }),
    ).toEqual({
      kind: 'rejected',
      reason: 'file-mismatch',
    })
  })

  test('reports vulnerability-type-not-allowed before evidence-not-added', () => {
    expect(
      groundVariant({
        vulnerabilityType: 'CWE-9999',
        evidence: ['not an added line'],
      }),
    ).toEqual({ kind: 'rejected', reason: 'vulnerability-type-not-allowed' })
  })

  test('reports evidence-not-added before range-not-added', () => {
    expect(
      groundVariant({
        evidence: ['not an added line'],
        startLine: 12,
        endLine: 13,
      }),
    ).toEqual({ kind: 'rejected', reason: 'evidence-not-added' })
  })
})
