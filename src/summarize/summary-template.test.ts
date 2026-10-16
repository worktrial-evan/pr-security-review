// tests the template summaries: every template is grounded in its packet and the fixed version is the lowest one above the installed version
import { describe, expect, test } from 'bun:test'
import type { Finding } from '@/shared/finding'
import {
  advisoriesByIdSample,
  codeReviewFindingSample,
  dependencyFindingSample,
  secretFindingSample,
} from './summary.samples'
import { buildSummaryPacket } from './summary-packet'
import {
  buildPreExistingSummary,
  buildTemplateSummary,
  pickFixedVersion,
} from './summary-template'
import { validateSummary } from './validate'

// one finding of each detector, plus a dependency finding with no fix and no advisory
const templateFindings: Finding[] = [
  dependencyFindingSample,
  {
    ...dependencyFindingSample,
    fixedVersions: [],
    advisoryId: 'GHSA-xxxx-yyyy-zzzz',
  },
  {
    ...dependencyFindingSample,
    reachability: 'direct-imported',
    dependencyPath: [],
  },
  codeReviewFindingSample,
  { ...codeReviewFindingSample, file: undefined, startLine: undefined },
  secretFindingSample,
]

describe('buildTemplateSummary', () => {
  test.each(templateFindings)(
    'passes the grounding rules for a $detector finding',
    (finding) => {
      // build the packet, then both templates
      const packet = buildSummaryPacket({
        finding,
        advisoriesById: advisoriesByIdSample,
      })
      const templateSummary = buildTemplateSummary(packet)
      const preExistingSummary = buildPreExistingSummary(packet)

      // check both against the packet's grounding
      expect(
        validateSummary({
          modelSummary: templateSummary,
          grounding: packet.grounding,
        }),
      ).toEqual([])
      expect(
        validateSummary({
          modelSummary: preExistingSummary,
          grounding: packet.grounding,
        }),
      ).toEqual([])
    },
  )

  test('names the fixed version as an upgrade action', () => {
    // build the template from the packet
    const packet = buildSummaryPacket({
      finding: dependencyFindingSample,
      advisoriesById: advisoriesByIdSample,
    })
    const templateSummary = buildTemplateSummary(packet)
    expect(templateSummary.summary).toBe(
      'lodash 4.17.20 is affected by GHSA-35jh-r3h4-6jhm. It is a transitive dependency through @acme/render@2.1.0.',
    )
    expect(templateSummary.remediation).toBe(
      'Upgrade lodash to 4.17.21 or later.',
    )
  })

  test('gives a one-line summary for a pre-existing finding', () => {
    // build the template from the packet
    const packet = buildSummaryPacket({
      finding: secretFindingSample,
      advisoriesById: advisoriesByIdSample,
    })
    const preExistingSummary = buildPreExistingSummary(packet)
    expect(preExistingSummary.summary).toBe(
      'The credential matching the github-token rule at config/deploy.yml line 7 was present before this pull request.',
    )
    expect(preExistingSummary.summary).not.toContain('\n')
  })
})

describe('pickFixedVersion', () => {
  test('picks the lowest fixed version above the installed one', () => {
    // pick the fixed version
    const fixedVersion = pickFixedVersion({
      ...dependencyFindingSample,
      version: '4.17.20',
      fixedVersions: ['5.0.1', '3.10.2', '4.17.21'],
    })
    expect(fixedVersion).toBe('4.17.21')
  })

  test('falls back to the first listed when none is above the installed one', () => {
    // pick the fixed version
    const fixedVersion = pickFixedVersion({
      ...dependencyFindingSample,
      version: '9.0.0',
      fixedVersions: ['4.17.21', '3.10.2'],
    })
    expect(fixedVersion).toBe('4.17.21')
  })

  test('returns undefined when no fix is published', () => {
    // pick the fixed version
    const fixedVersion = pickFixedVersion({
      ...dependencyFindingSample,
      fixedVersions: [],
    })
    expect(fixedVersion).toBeUndefined()
  })
})
