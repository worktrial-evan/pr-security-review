// tests the model output schema: a round trip, an empty answer, and the rejected evidence, severity, line and confidence values
import { describe, expect, test } from 'bun:test'
import { sqlInjectionModelFinding } from './fixtures/model-findings'
import {
  type CodeReviewOutput,
  codeReviewOutputSchema,
  modelFindingSchema,
} from './model-output'

// a valid answer with the sample finding and one injection attempt in the same file
const validOutput: CodeReviewOutput = {
  findings: [sqlInjectionModelFinding],
  injectionAttempts: [{ file: sqlInjectionModelFinding.file, line: 3 }],
}

// return the top-level fields the finding schema rejected, or an empty list when the finding parsed
function findRejectedFields(finding: unknown): string[] {
  const parseResult = modelFindingSchema.safeParse(finding)
  if (parseResult.success) {
    return []
  }
  return parseResult.error.issues.map((issue) => String(issue.path[0]))
}

describe('codeReviewOutputSchema', () => {
  test('round-trips a valid output unchanged', () => {
    expect(codeReviewOutputSchema.parse(validOutput)).toEqual(validOutput)
  })

  test('parses an output with no findings and no injection attempts', () => {
    const emptyOutput: CodeReviewOutput = {
      findings: [],
      injectionAttempts: [],
    }

    expect(codeReviewOutputSchema.parse(emptyOutput)).toEqual(emptyOutput)
  })

  test('rejects an injection attempt on line 0', () => {
    const parseResult = codeReviewOutputSchema.safeParse({
      findings: [],
      injectionAttempts: [{ file: sqlInjectionModelFinding.file, line: 0 }],
    })

    expect(parseResult.success).toBe(false)
  })
})

describe('modelFindingSchema', () => {
  test('accepts the sample finding', () => {
    expect(findRejectedFields(sqlInjectionModelFinding)).toEqual([])
  })

  test('rejects a finding with empty evidence', () => {
    expect(
      findRejectedFields({ ...sqlInjectionModelFinding, evidence: [] }),
    ).toEqual(['evidence'])
  })

  test('rejects an unknown severity', () => {
    expect(
      findRejectedFields({ ...sqlInjectionModelFinding, severity: 'urgent' }),
    ).toEqual(['severity'])
  })

  test('rejects startLine 0', () => {
    expect(
      findRejectedFields({ ...sqlInjectionModelFinding, startLine: 0 }),
    ).toEqual(['startLine'])
  })

  test('rejects confidence 1.5', () => {
    expect(
      findRejectedFields({ ...sqlInjectionModelFinding, confidence: 1.5 }),
    ).toEqual(['confidence'])
  })
})
