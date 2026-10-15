// the advisory contract: the OSV subset of an advisory, its affected packages, the snapshot it came from and the AdvisoryStore interface
import { z } from 'zod'

// how an affected range is expressed: by semver, by ecosystem version order or by git commit
export const advisoryRangeTypes = ['SEMVER', 'ECOSYSTEM', 'GIT'] as const
export const advisoryRangeTypeSchema = z.enum(advisoryRangeTypes)
export type AdvisoryRangeType = z.infer<typeof advisoryRangeTypeSchema>

// one point in an affected range: where it starts, where it is fixed or the last version it covers
export const advisoryRangeEventSchema = z.object({
  introduced: z.string().optional(),
  fixed: z.string().optional(),
  lastAffected: z.string().optional(),
})
export type AdvisoryRangeEvent = z.infer<typeof advisoryRangeEventSchema>

// a range of affected versions, as a sequence of events
export const advisoryRangeSchema = z.object({
  type: advisoryRangeTypeSchema,
  events: z.array(advisoryRangeEventSchema),
})
export type AdvisoryRange = z.infer<typeof advisoryRangeSchema>

// a package the advisory affects, by range and by listed version
export const affectedPackageSchema = z.object({
  ecosystem: z.string(),
  name: z.string(),
  ranges: z.array(advisoryRangeSchema),
  versions: z.array(z.string()),
})
export type AffectedPackage = z.infer<typeof affectedPackageSchema>

// a link the advisory cites, typed the OSV way: ADVISORY, WEB, FIX and so on
export const advisoryReferenceSchema = z.object({
  type: z.string(),
  url: z.url(),
})
export type AdvisoryReference = z.infer<typeof advisoryReferenceSchema>

// one advisory from the OSV feed. isGithubReviewed says the GitHub advisory database reviewed it
export const advisorySchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  summary: z.string(),
  details: z.string(),
  severityScore: z.number().optional(),
  severityVector: z.string().optional(),
  affected: z.array(affectedPackageSchema),
  references: z.array(advisoryReferenceSchema),
  published: z.iso.datetime({ offset: true }),
  modified: z.iso.datetime({ offset: true }),
  withdrawn: z.iso.datetime({ offset: true }).optional(),
  isGithubReviewed: z.boolean(),
})
export type Advisory = z.infer<typeof advisorySchema>

// where and when the advisories were fetched, with the digest of the fetched data
export const advisorySnapshotSchema = z.object({
  fetchedAt: z.iso.datetime({ offset: true }),
  sourceUrl: z.url(),
  entryCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})
export type AdvisorySnapshot = z.infer<typeof advisorySnapshotSchema>

// a lookup of advisories by package name, with the snapshot it was built from
export interface AdvisoryStore {
  getByPackage(name: string): Promise<Advisory[]>
  snapshot: AdvisorySnapshot
}
