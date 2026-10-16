// tests for the match rules: the detector check and the dependency, code and secret rules with their edges
import { describe, expect, test } from 'bun:test'
import type { ExpectedFinding } from '@/shared/benchmark'
import type { Finding } from '@/shared/finding'
import {
  codeReviewFindingSample,
  dependencyFindingSample,
  secretFindingSample,
} from '@/shared/finding.samples'
import {
  areVulnerabilityTypesInSameFamily,
  matchesExpectedFinding,
} from './match-rules'

// the sample secret finding is pre-existing, so the secret tests use an introduced copy
const introducedSecretFinding: Finding = {
  ...secretFindingSample,
  isIntroducedByPullRequest: true,
}

// the labels that match each sample finding exactly
const expectedDependencyFinding: ExpectedFinding = {
  detector: 'dependency',
  packageName: 'lodash',
  advisoryId: 'GHSA-35jh-r3h4-6jhm',
}
const expectedCodeReviewFinding: ExpectedFinding = {
  detector: 'code-review',
  vulnerabilityType: 'CWE-89',
  file: 'src/users.ts',
  startLine: 42,
  endLine: 44,
}
const expectedSecretFinding: ExpectedFinding = {
  detector: 'secrets',
  file: 'config/deploy.yml',
  startLine: 7,
}

describe('detector check', () => {
  test('detector mismatch', () => {
    // a dependency label and a code-review prediction sharing a file and lines
    const expectedFinding: ExpectedFinding = {
      ...expectedDependencyFinding,
      file: 'src/users.ts',
      startLine: 42,
      endLine: 44,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: codeReviewFindingSample,
      }),
    ).toBe(false)
  })
})

describe('dependency match rule', () => {
  test('alias matches', () => {
    // expect the CVE while the prediction reports the GHSA id with that CVE as an alias
    const expectedFinding: ExpectedFinding = {
      ...expectedDependencyFinding,
      advisoryId: 'CVE-2021-23337',
    }
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: dependencyFindingSample,
      }),
    ).toBe(true)
  })

  test('alias matches the other way round', () => {
    // expect the GHSA id while the prediction reports the CVE with the GHSA id as an alias
    const predictedFinding: Finding = {
      ...dependencyFindingSample,
      advisoryId: 'CVE-2021-23337',
      aliases: ['GHSA-35jh-r3h4-6jhm'],
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedDependencyFinding,
        predictedFinding,
      }),
    ).toBe(true)
  })

  test('package differs', () => {
    // the same advisory id on a different package
    const expectedFinding: ExpectedFinding = {
      ...expectedDependencyFinding,
      packageName: 'underscore',
    }
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: dependencyFindingSample,
      }),
    ).toBe(false)
  })

  test('ids and package names compare exactly', () => {
    // a lowercase advisory id and a capitalized package name match nothing
    const lowercaseIdFinding: ExpectedFinding = {
      ...expectedDependencyFinding,
      advisoryId: 'ghsa-35jh-r3h4-6jhm',
    }
    const capitalizedPackageFinding: ExpectedFinding = {
      ...expectedDependencyFinding,
      packageName: 'Lodash',
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: lowercaseIdFinding,
        predictedFinding: dependencyFindingSample,
      }),
    ).toBe(false)
    expect(
      matchesExpectedFinding({
        expectedFinding: capitalizedPackageFinding,
        predictedFinding: dependencyFindingSample,
      }),
    ).toBe(false)
  })

  test('a label without an advisory id matches nothing', () => {
    const expectedFinding: ExpectedFinding = {
      detector: 'dependency',
      packageName: 'lodash',
    }
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: dependencyFindingSample,
      }),
    ).toBe(false)
  })
})

describe('code match rule', () => {
  test('same family', () => {
    // CWE-79 expected and CWE-80 predicted in the same file and lines
    const expectedFinding: ExpectedFinding = {
      ...expectedCodeReviewFinding,
      vulnerabilityType: 'CWE-79',
    }
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      vulnerabilityType: 'CWE-80',
    }
    expect(matchesExpectedFinding({ expectedFinding, predictedFinding })).toBe(
      true,
    )
  })

  test('within tolerance', () => {
    // expected 40 to 42, predicted 46 to 47
    const expectedFinding: ExpectedFinding = {
      ...expectedCodeReviewFinding,
      startLine: 40,
      endLine: 42,
    }
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      startLine: 46,
      endLine: 47,
    }
    expect(matchesExpectedFinding({ expectedFinding, predictedFinding })).toBe(
      true,
    )
  })

  test('outside tolerance', () => {
    // expected 40 to 42, predicted 48 to 49
    const expectedFinding: ExpectedFinding = {
      ...expectedCodeReviewFinding,
      startLine: 40,
      endLine: 42,
    }
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      startLine: 48,
      endLine: 49,
    }
    expect(matchesExpectedFinding({ expectedFinding, predictedFinding })).toBe(
      false,
    )
  })

  test('a range with no end line is one line long on either side', () => {
    // expected line 40 alone against predicted line 45 alone, then line 46 alone
    const expectedFinding: ExpectedFinding = {
      ...expectedCodeReviewFinding,
      startLine: 40,
      endLine: undefined,
    }
    const nearPrediction: Finding = {
      ...codeReviewFindingSample,
      startLine: 45,
      endLine: undefined,
    }
    const farPrediction: Finding = { ...nearPrediction, startLine: 46 }
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: nearPrediction,
      }),
    ).toBe(true)
    expect(
      matchesExpectedFinding({
        expectedFinding,
        predictedFinding: farPrediction,
      }),
    ).toBe(false)
  })

  test('different file', () => {
    // the same vulnerabilityType and lines in another file
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      file: 'src/orders.ts',
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedCodeReviewFinding,
        predictedFinding,
      }),
    ).toBe(false)
  })

  test('no expected file matches on the vulnerabilityType alone', () => {
    // a label with only a vulnerabilityType against a prediction far away in another file
    const expectedFinding: ExpectedFinding = {
      detector: 'code-review',
      vulnerabilityType: 'CWE-89',
    }
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      file: 'src/orders.ts',
      startLine: 900,
      endLine: 901,
    }
    expect(matchesExpectedFinding({ expectedFinding, predictedFinding })).toBe(
      true,
    )
  })

  test('no expected lines match on the file alone', () => {
    // a label with a file but no lines against a prediction far down the same file
    const expectedFinding: ExpectedFinding = {
      detector: 'code-review',
      vulnerabilityType: 'CWE-89',
      file: 'src/users.ts',
    }
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      startLine: 900,
      endLine: 901,
    }
    expect(matchesExpectedFinding({ expectedFinding, predictedFinding })).toBe(
      true,
    )
  })

  test('a prediction with no lines never meets a labeled range', () => {
    const predictedFinding: Finding = {
      ...codeReviewFindingSample,
      startLine: undefined,
      endLine: undefined,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedCodeReviewFinding,
        predictedFinding,
      }),
    ).toBe(false)
  })

  test('vulnerabilityType compares without case, prefix, separator or leading zeros', () => {
    // lowercase, a bare number, a space, a leading zero and a family member all normalize before the comparison
    expect(
      areVulnerabilityTypesInSameFamily({
        firstVulnerabilityType: 'cwe-89',
        secondVulnerabilityType: '89',
      }),
    ).toBe(true)
    expect(
      areVulnerabilityTypesInSameFamily({
        firstVulnerabilityType: '79',
        secondVulnerabilityType: 'cwe-80',
      }),
    ).toBe(true)
    expect(
      areVulnerabilityTypesInSameFamily({
        firstVulnerabilityType: 'CWE 79',
        secondVulnerabilityType: 'CWE-079',
      }),
    ).toBe(true)
    expect(
      areVulnerabilityTypesInSameFamily({
        firstVulnerabilityType: 'CWE-79',
        secondVulnerabilityType: 'CWE-89',
      }),
    ).toBe(false)
  })
})

describe('secret match rule', () => {
  test('within two lines', () => {
    // expected line 7, predicted line 9
    const predictedFinding: Finding = {
      ...introducedSecretFinding,
      startLine: 9,
      endLine: 9,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedSecretFinding,
        predictedFinding,
      }),
    ).toBe(true)
  })

  test('two lines before', () => {
    // expected line 7, predicted line 5
    const predictedFinding: Finding = {
      ...introducedSecretFinding,
      startLine: 5,
      endLine: 5,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedSecretFinding,
        predictedFinding,
      }),
    ).toBe(true)
  })

  test('three lines away', () => {
    // expected line 7, predicted line 10
    const predictedFinding: Finding = {
      ...introducedSecretFinding,
      startLine: 10,
      endLine: 10,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: expectedSecretFinding,
        predictedFinding,
      }),
    ).toBe(false)
  })

  test('a label without a file or a start line matches nothing', () => {
    const fileOnlyFinding: ExpectedFinding = {
      detector: 'secrets',
      file: 'config/deploy.yml',
    }
    const lineOnlyFinding: ExpectedFinding = {
      detector: 'secrets',
      startLine: 7,
    }
    expect(
      matchesExpectedFinding({
        expectedFinding: fileOnlyFinding,
        predictedFinding: introducedSecretFinding,
      }),
    ).toBe(false)
    expect(
      matchesExpectedFinding({
        expectedFinding: lineOnlyFinding,
        predictedFinding: introducedSecretFinding,
      }),
    ).toBe(false)
  })
})
