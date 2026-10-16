// tests the grounding validator: one rule each for versions, advisory ids, packages and urls, plus missing and grounded summaries
import { describe, expect, test } from 'bun:test'
import {
  advisoriesByIdSample,
  codeReviewFindingSample,
  dependencyFindingSample,
} from './summary.samples'
import { buildSummaryPacket } from './summary-packet'
import { validateSummary } from './validate'

// the grounding of the sample dependency finding
const dependencyGrounding = buildSummaryPacket({
  finding: dependencyFindingSample,
  advisoriesById: advisoriesByIdSample,
}).grounding

// validate one summary and remediation against the dependency grounding
function validateDependencyText(
  summary: string,
  remediation: string,
): string[] {
  return validateSummary({
    modelSummary: { summary, remediation },
    grounding: dependencyGrounding,
  })
}

describe('validateSummary', () => {
  test('accepts a summary that names only identifiers from the packet', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash 4.17.20 has a command injection, tracked as GHSA-35jh-r3h4-6jhm and CVE-2021-23337. It arrives through @acme/render.',
      'Upgrade lodash to v4.17.21. See https://github.com/advisories/GHSA-35jh-r3h4-6jhm.',
    )
    expect(violations).toEqual([])
  })

  test('rejects a version the packet does not hold', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash has a command injection.',
      'Upgrade lodash to 4.18.0.',
    )
    expect(violations).toEqual(['version 4.18.0 is not in the input'])
  })

  test('rejects a CVE id the packet does not hold', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash is affected by CVE-2020-8203.',
      'Upgrade lodash.',
    )
    expect(violations).toEqual([
      'advisory id CVE-2020-8203 is not in the input',
    ])
  })

  test('rejects a GHSA id the packet does not hold', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash is affected by GHSA-p6mc-m468-83gw.',
      'Upgrade lodash.',
    )
    expect(violations).toEqual([
      'advisory id GHSA-P6MC-M468-83GW is not in the input',
    ])
  })

  test('rejects a package that is not on the dependency path', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash has a command injection.',
      'Replace it with @evil/lodash-fork or lodash-es@4.17.21.',
    )
    expect(violations).toEqual([
      "package @evil/lodash-fork is not the finding's package or on its dependency path",
      "package lodash-es is not the finding's package or on its dependency path",
    ])
  })

  test('rejects a url that is not an advisory reference', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash has a command injection.',
      'Follow https://example.com/fix-lodash to upgrade.',
    )
    expect(violations).toEqual([
      'url https://example.com/fix-lodash is not one of the advisory references',
    ])
  })

  test('checks a version inside an allowed url only as part of the url', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash has a command injection.',
      'Read https://nvd.nist.gov/vuln/detail/CVE-2021-23337 before you upgrade.',
    )
    expect(violations).toEqual([])
  })

  test('rejects a missing summary', () => {
    // validate the summary against its packet
    const violations = validateSummary({
      modelSummary: undefined,
      grounding: dependencyGrounding,
    })
    expect(violations).toEqual(['no summary was returned for this finding'])
  })

  test('rejects an empty remediation', () => {
    // validate the text against the dependency packet
    const violations = validateDependencyText(
      'lodash has a command injection.',
      ' ',
    )
    expect(violations).toEqual(['the summary or the remediation is empty'])
  })

  test('rejects any package on a code finding', () => {
    // validate a package mention against the code packet
    const codeGrounding = buildSummaryPacket({
      finding: codeReviewFindingSample,
      advisoriesById: advisoriesByIdSample,
    }).grounding
    // validate the summary against its packet
    const violations = validateSummary({
      modelSummary: {
        summary: 'The id reaches the query string unbound.',
        remediation: 'Use sql-template-strings@2.2.2 to bind the id.',
      },
      grounding: codeGrounding,
    })
    expect(violations).toEqual([
      'version 2.2.2 is not in the input',
      "package sql-template-strings is not the finding's package or on its dependency path",
    ])
  })
})
