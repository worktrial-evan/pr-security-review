// the finding contract: severities, detector kinds, the branded finding id, the finding variants and the id derivation
import { z } from 'zod'
import { dependencyScopeSchema } from './dependency'

// the severities a finding can have, highest first
export const severities = ['critical', 'high', 'medium', 'low', 'info'] as const
export const severitySchema = z.enum(severities)
export type Severity = z.infer<typeof severitySchema>

// the detectors that produce findings
export const detectorKinds = ['sca', 'code-review', 'secrets'] as const
export const detectorKindSchema = z.enum(detectorKinds)
export type DetectorKind = z.infer<typeof detectorKindSchema>

// a finding id is the first 16 lowercase hex characters of a sha256 digest
const findingIdLength = 16
const findingIdPattern = new RegExp(`^[0-9a-f]{${findingIdLength}}$`)
export const findingIdSchema = z
  .string()
  .regex(findingIdPattern)
  .brand('FindingId')
export type FindingId = z.infer<typeof findingIdSchema>

// where a finding summary came from: model or template
export const summarySources = ['model', 'template'] as const
export const summarySourceSchema = z.enum(summarySources)
export type SummarySource = z.infer<typeof summarySourceSchema>

// how a vulnerable dependency reaches the code under review
export const reachabilityKinds = [
  'direct-imported',
  'direct-unused',
  'transitive',
] as const
export const reachabilityKindSchema = z.enum(reachabilityKinds)
export type ReachabilityKind = z.infer<typeof reachabilityKindSchema>

// which matchers reported a vulnerable dependency: the handwritten one, the oracle, or both
export const matcherAgreements = [
  'both',
  'handwritten-only',
  'oracle-only',
  'oracle-unavailable',
] as const
export const matcherAgreementSchema = z.enum(matcherAgreements)
export type MatcherAgreement = z.infer<typeof matcherAgreementSchema>

// the fields every finding has, whatever detector produced it
export const findingBaseSchema = z.object({
  id: findingIdSchema,
  detector: detectorKindSchema,
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  title: z.string(),
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  isIntroducedByPullRequest: z.boolean(),
  summary: z.string().optional(),
  remediation: z.string().optional(),
  summarySource: summarySourceSchema.optional(),
})
export type FindingBase = z.infer<typeof findingBaseSchema>

// a vulnerable dependency found by the sca detector
export const scaFindingSchema = findingBaseSchema.extend({
  detector: z.literal('sca'),
  packageName: z.string(),
  version: z.string(),
  advisoryId: z.string(),
  aliases: z.array(z.string()),
  isGithubReviewed: z.boolean(),
  dependencyScope: dependencyScopeSchema,
  reachability: reachabilityKindSchema,
  importedBy: z.array(z.string()),
  dependencyPath: z.array(z.string()),
  fixedVersions: z.array(z.string()),
  cvssScore: z.number().min(0).max(10).optional(),
  isVersionUnparseable: z.boolean(),
  matcherAgreement: matcherAgreementSchema,
})
export type ScaFinding = z.infer<typeof scaFindingSchema>

// a weakness in the changed code found by the code-review detector
export const codeReviewFindingSchema = findingBaseSchema.extend({
  detector: z.literal('code-review'),
  cwe: z.string(),
  evidence: z.array(z.string()),
  sourceToSink: z.string(),
  promptVersion: z.string(),
  model: z.string(),
})
export type CodeReviewFinding = z.infer<typeof codeReviewFindingSchema>

// a leaked credential found by the secrets detector
export const secretFindingSchema = findingBaseSchema.extend({
  detector: z.literal('secrets'),
  ruleId: z.string(),
  fingerprint: z.string(),
})
export type SecretFinding = z.infer<typeof secretFindingSchema>

// a finding of any detector, selected by its detector field
export const findingSchema = z.discriminatedUnion('detector', [
  scaFindingSchema,
  codeReviewFindingSchema,
  secretFindingSchema,
])
export type Finding = z.infer<typeof findingSchema>

// the inputs a finding id is derived from
export interface CreateFindingIdOptions {
  detector: DetectorKind
  stableKey: string
}

/** Derives a finding id from the detector kind and the finding's stable key. */
export function createFindingId({
  detector,
  stableKey,
}: CreateFindingIdOptions): FindingId {
  // hash the detector and the stable key separated by a newline
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(`${detector}\n${stableKey}`)
  const digestHex = hasher.digest('hex')

  // keep the leading hex characters and brand them at the schema boundary
  const findingId = digestHex.slice(0, findingIdLength)
  return findingIdSchema.parse(findingId)
}
