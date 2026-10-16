// tests the dedupe. repeated ids and a version two lockfiles repeat are dropped. findings two detectors report are dropped too and the rest stay
import { describe, expect, test } from 'bun:test'
import { type CodeReviewFinding, createFindingId } from '@/shared/finding'
import {
  codeReviewFindingSample,
  scaFindingSample,
  secretFindingSample,
} from '@/shared/finding.samples'
import { dedupeFindings } from './dedupe-step'

// a code-review finding with its own id and the given fields
function createCodeReviewFinding(
  fields: Partial<CodeReviewFinding>,
): CodeReviewFinding {
  return {
    ...codeReviewFindingSample,
    id: createFindingId({
      detector: 'code-review',
      stableKey: JSON.stringify(fields),
    }),
    ...fields,
  }
}

describe('dedupeFindings', () => {
  test('drops a second finding with the same id', () => {
    const { keptFindings, droppedFindings } = dedupeFindings([
      scaFindingSample,
      scaFindingSample,
    ])

    expect(keptFindings).toEqual([scaFindingSample])
    expect(droppedFindings.map(({ reason }) => reason)).toEqual([
      'duplicate-id',
    ])
  })

  test('drops a vulnerable version a second lockfile repeats', () => {
    const otherLockfileFinding = {
      ...scaFindingSample,
      id: createFindingId({ detector: 'sca', stableKey: 'package-lock.json' }),
      file: 'package-lock.json',
    }
    const { keptFindings, droppedFindings } = dedupeFindings([
      scaFindingSample,
      otherLockfileFinding,
    ])

    expect(keptFindings).toEqual([scaFindingSample])
    expect(droppedFindings.map(({ reason }) => reason)).toEqual([
      'same-dependency-in-another-lockfile',
    ])
  })

  test('drops a code-review finding on a bump the dependency detector reports', () => {
    const bumpFinding = createCodeReviewFinding({
      file: 'package.json',
      title: `Vulnerable ${scaFindingSample.packageName} version added`,
      startLine: 3,
      endLine: 3,
    })
    const { keptFindings, droppedFindings } = dedupeFindings([
      scaFindingSample,
      bumpFinding,
    ])

    expect(keptFindings).toEqual([scaFindingSample])
    expect(droppedFindings).toEqual([
      { finding: bumpFinding, reason: 'covered-by-dependency-finding' },
    ])
  })

  test('keeps a code-review finding in a dependency file about another package', () => {
    const otherPackageFinding = createCodeReviewFinding({
      file: 'package.json',
      title: `Install script runs ${scaFindingSample.packageName}-cli from a url`,
    })

    expect(
      dedupeFindings([scaFindingSample, otherPackageFinding]).keptFindings,
    ).toHaveLength(2)
  })

  test('drops a hardcoded credential on a line the secrets detector reports', () => {
    const credentialFinding = createCodeReviewFinding({
      cwe: 'CWE-798',
      file: secretFindingSample.file,
      startLine: secretFindingSample.startLine,
      endLine: secretFindingSample.endLine,
    })
    const otherLineFinding = createCodeReviewFinding({
      cwe: 'CWE-798',
      file: secretFindingSample.file,
      startLine: (secretFindingSample.startLine ?? 1) + 10,
      endLine: (secretFindingSample.startLine ?? 1) + 10,
    })
    const { keptFindings, droppedFindings } = dedupeFindings([
      secretFindingSample,
      credentialFinding,
      otherLineFinding,
    ])

    expect(keptFindings).toEqual([secretFindingSample, otherLineFinding])
    expect(droppedFindings.map(({ reason }) => reason)).toEqual([
      'covered-by-secret-finding',
    ])
  })

  test('keeps findings of every detector in input order when nothing repeats', () => {
    const findings = [
      codeReviewFindingSample,
      secretFindingSample,
      scaFindingSample,
    ]

    expect(dedupeFindings(findings).keptFindings).toEqual(findings)
  })
})
