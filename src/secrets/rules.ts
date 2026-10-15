// the credential rules the detector applies to added lines, modeled on the public gitleaks categories

import type { Severity } from '@/shared/finding'

// one credential rule. the pattern is global and valueGroup names the capture holding the value, or 0 for the whole match
export interface SecretRule {
  ruleId: string
  title: string
  severity: Severity
  confidence: number
  pattern: RegExp
  valueGroup: number
  isEntropyChecked: boolean
}

// the shortest quoted value the generic rule accepts
export const genericMinimumValueLength = 16

// the entropy a generic value must exceed, in bits per character
export const genericMinimumEntropy = 3.5

// the rules in matching order. specific rules come first and the generic rule is last, so a value that fits both reports the specific rule
export const secretRules: SecretRule[] = [
  {
    ruleId: 'aws-access-key-id',
    title: 'AWS access key id',
    severity: 'high',
    confidence: 0.9,
    pattern: /\b(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'aws-secret-access-key',
    title: 'AWS secret access key',
    severity: 'critical',
    confidence: 0.8,
    pattern:
      /aws[^\n'"]{0,30}(?:secret|key)[^\n'"]{0,30}['"]?\s*[:=>]+\s*['"]([A-Za-z0-9/+=]{40})['"]/gi,
    valueGroup: 1,
    isEntropyChecked: false,
  },
  {
    ruleId: 'github-token',
    title: 'GitHub token',
    severity: 'critical',
    confidence: 0.95,
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'slack-token',
    title: 'Slack token',
    severity: 'high',
    confidence: 0.95,
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,48}/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'stripe-live-key',
    title: 'Stripe live key',
    severity: 'critical',
    confidence: 0.95,
    pattern: /\b[rs]k_live_[0-9A-Za-z]{24,99}\b/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'google-api-key',
    title: 'Google API key',
    severity: 'high',
    confidence: 0.9,
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'private-key',
    title: 'Private key block',
    severity: 'critical',
    confidence: 0.95,
    pattern: /-----BEGIN[ A-Z]*PRIVATE KEY(?: BLOCK)?-----/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'jwt',
    title: 'JSON Web Token',
    severity: 'medium',
    confidence: 0.7,
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    valueGroup: 0,
    isEntropyChecked: false,
  },
  {
    ruleId: 'generic-secret',
    title: 'Hardcoded secret assignment',
    severity: 'medium',
    confidence: 0.5,
    pattern: new RegExp(
      `(?:secret|password|token|api_?key)[\\w.-]*['"]?\\s*[:=]+>?\\s*['"]([^'"]{${genericMinimumValueLength},})['"]`,
      'gi',
    ),
    valueGroup: 1,
    isEntropyChecked: true,
  },
]
