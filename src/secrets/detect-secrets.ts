// finds credentials on the lines a pull request adds and reports a fingerprint of each, never the value

import type { SecretFinding } from '@/shared/finding'
import { createFindingId } from '@/shared/finding'
import type { ChangedFile } from '@/shared/pull-request-source'
import {
  calculateShannonEntropy,
  isAllowlistedFile,
  isAllowlistedLine,
  isAllowlistedValue,
} from './allowlist'
import { genericMinimumEntropy, type SecretRule, secretRules } from './rules'

// the number of hex characters of the sha256 digest kept as a fingerprint
const fingerprintLength = 12

// the longest added line the detector scans. a longer line is skipped and listed
export const maxScannedLineLength = 4000

// an added line skipped for its length
export interface OverlongAddedLine {
  file: string
  line: number
  length: number
}

export interface DetectSecretsOptions {
  changedFiles: ChangedFile[]
}

// one added line to scan, with where it is
interface AddedLineToScan {
  file: string
  line: number
  text: string
}

/** Returns a finding for every credential on the added lines of the changed files. */
export function detectSecrets({
  changedFiles,
}: DetectSecretsOptions): SecretFinding[] {
  const secretFindings: SecretFinding[] = []

  // scan every file that is not a fixture or an example env file
  for (const changedFile of changedFiles) {
    if (isAllowlistedFile(changedFile.path)) {
      continue
    }
    secretFindings.push(...detectSecretsInFile(changedFile))
  }

  return secretFindings
}

/** Returns every added line the detector skips for being longer than maxScannedLineLength. */
export function listOverlongAddedLines({
  changedFiles,
}: DetectSecretsOptions): OverlongAddedLine[] {
  const overlongAddedLines: OverlongAddedLine[] = []

  // list the long lines of every file the detector scans
  for (const changedFile of changedFiles) {
    if (isAllowlistedFile(changedFile.path)) {
      continue
    }
    for (const addedLine of changedFile.addedLines) {
      if (addedLine.text.length > maxScannedLineLength) {
        overlongAddedLines.push({
          file: changedFile.path,
          line: addedLine.line,
          length: addedLine.text.length,
        })
      }
    }
  }

  return overlongAddedLines
}

// scan the added lines of one file. leave out lines marked secrets-allow and lines over the length limit
function detectSecretsInFile(changedFile: ChangedFile): SecretFinding[] {
  const secretFindings: SecretFinding[] = []

  for (const addedLine of changedFile.addedLines) {
    if (isAllowlistedLine(addedLine.text)) {
      continue
    }
    if (addedLine.text.length > maxScannedLineLength) {
      continue
    }
    const addedLineToScan = {
      file: changedFile.path,
      line: addedLine.line,
      text: addedLine.text,
    }
    secretFindings.push(...detectSecretsInLine(addedLineToScan))
  }

  return secretFindings
}

// run the rules in order over one line and report each distinct value once
function detectSecretsInLine(addedLine: AddedLineToScan): SecretFinding[] {
  const secretFindings: SecretFinding[] = []
  const seenValues = new Set<string>()

  for (const rule of secretRules) {
    const matches = addedLine.text.matchAll(rule.pattern)
    for (const match of matches) {
      // take the value and remember it, so a later rule does not report it again
      const value = match[rule.valueGroup]
      if (value === undefined || seenValues.has(value)) {
        continue
      }
      seenValues.add(value)

      // skip a placeholder or a value too regular to be a secret
      if (!isReportableValue({ rule, value })) {
        continue
      }
      secretFindings.push(createSecretFinding({ addedLine, rule, value }))
    }
  }

  return secretFindings
}

interface IsReportableValueOptions {
  rule: SecretRule
  value: string
}

// tell whether a matched value passes the allowlist and the rule's entropy check
function isReportableValue({ rule, value }: IsReportableValueOptions): boolean {
  if (isAllowlistedValue(value)) {
    return false
  }
  if (!rule.isEntropyChecked) {
    return true
  }
  return calculateShannonEntropy(value) > genericMinimumEntropy
}

interface CreateSecretFindingOptions {
  addedLine: AddedLineToScan
  rule: SecretRule
  value: string
}

// build the finding from the rule and the location, holding the value's fingerprint and nothing of the value
function createSecretFinding({
  addedLine,
  rule,
  value,
}: CreateSecretFindingOptions): SecretFinding {
  // fingerprint the value and derive the id from where and what it is
  const fingerprint = createFingerprint(value)
  const stableKey = [
    addedLine.file,
    String(addedLine.line),
    rule.ruleId,
    fingerprint,
  ].join('\n')
  const findingId = createFindingId({ detector: 'secrets', stableKey })

  return {
    id: findingId,
    detector: 'secrets',
    severity: rule.severity,
    confidence: rule.confidence,
    title: `${rule.title} added in ${addedLine.file}`,
    file: addedLine.file,
    startLine: addedLine.line,
    endLine: addedLine.line,
    isIntroducedByPullRequest: true,
    ruleId: rule.ruleId,
    fingerprint,
  }
}

// take the leading hex characters of the sha256 digest of a value
function createFingerprint(value: string): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(value)
  const digestHex = hasher.digest('hex')
  return digestHex.slice(0, fingerprintLength)
}
