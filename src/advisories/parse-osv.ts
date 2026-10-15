// maps one OSV JSON entry onto the shared Advisory contract and reports why an entry does not fit
import { z } from 'zod'
import {
  type Advisory,
  type AdvisoryRangeEvent,
  type AffectedPackage,
  advisorySchema,
} from '@/shared/advisory'
import { computeCvss3BaseScore } from './cvss'

// one range event. an unknown event key such as limit fails the parse, so format drift surfaces
const osvRangeEventSchema = z.strictObject({
  introduced: z.string().optional(),
  fixed: z.string().optional(),
  last_affected: z.string().optional(),
})

// one affected range. the type is checked against the contract after mapping
const osvRangeSchema = z.object({
  type: z.string(),
  events: z.array(osvRangeEventSchema),
})

// one affected item. the package is missing on entries that only name a git repository
const osvAffectedSchema = z.object({
  package: z.object({ name: z.string(), ecosystem: z.string() }).optional(),
  ranges: z.array(osvRangeSchema).optional(),
  versions: z.array(z.string()).optional(),
})

// one severity entry. score holds the CVSS vector string, never a number
const osvSeveritySchema = z.object({ type: z.string(), score: z.string() })

// the OSV fields this module reads. every other field is ignored
const osvEntrySchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()).optional(),
  summary: z.string().optional(),
  details: z.string().optional(),
  severity: z.array(osvSeveritySchema).optional(),
  affected: z.array(osvAffectedSchema).optional(),
  references: z
    .array(z.object({ type: z.string(), url: z.string() }))
    .optional(),
  published: z.string(),
  modified: z.string(),
  withdrawn: z.string().optional(),
  database_specific: z
    .object({ github_reviewed: z.boolean().optional() })
    .optional(),
})
type OsvEntry = z.infer<typeof osvEntrySchema>
type OsvAffected = z.infer<typeof osvAffectedSchema>

// the outcome of parsing one entry. failed holds a message naming the offending fields
export type ParseOsvEntryResult =
  | { status: 'parsed'; advisory: Advisory }
  | { status: 'failed'; message: string }

/**
 * Parses one OSV entry into an Advisory, or reports which fields do not fit the OSV shape or the contract.
 */
export function parseOsvEntry(entry: unknown): ParseOsvEntryResult {
  // read the OSV fields
  const osvParseResult = osvEntrySchema.safeParse(entry)
  if (!osvParseResult.success) {
    return {
      status: 'failed',
      message: z.prettifyError(osvParseResult.error),
    }
  }

  // map onto the contract and check the mapped value against it
  const mappedAdvisory = mapOsvEntry(osvParseResult.data)
  const advisoryParseResult = advisorySchema.safeParse(mappedAdvisory)
  if (!advisoryParseResult.success) {
    return {
      status: 'failed',
      message: z.prettifyError(advisoryParseResult.error),
    }
  }
  return { status: 'parsed', advisory: advisoryParseResult.data }
}

// build the contract shape from the OSV fields. missing lists become empty lists
function mapOsvEntry(osvEntry: OsvEntry): unknown {
  // pick the severity vector and score
  const severity = readSeverity(osvEntry)

  // keep only affected items that name a package
  const affectedPackages = (osvEntry.affected ?? []).flatMap(mapAffected)

  return {
    id: osvEntry.id,
    aliases: osvEntry.aliases ?? [],
    summary: osvEntry.summary ?? '',
    details: osvEntry.details ?? '',
    ...severity,
    affected: affectedPackages,
    references: (osvEntry.references ?? []).map(mapReference),
    published: osvEntry.published,
    modified: osvEntry.modified,
    ...(osvEntry.withdrawn === undefined
      ? {}
      : { withdrawn: osvEntry.withdrawn }),
    isGithubReviewed: osvEntry.database_specific?.github_reviewed ?? false,
  }
}

// prefix https to a reference url written without a scheme, such as github.com/npm/cli. any other url stays as written
function mapReference(
  osvReference: NonNullable<OsvEntry['references']>[number],
): { type: string; url: string } {
  const isUrlWithoutScheme =
    !URL.canParse(osvReference.url) &&
    URL.canParse(`https://${osvReference.url}`)
  if (!isUrlWithoutScheme) {
    return osvReference
  }
  return { type: osvReference.type, url: `https://${osvReference.url}` }
}

// the severity fields of an advisory. both are absent when the entry has no CVSS entry
interface Severity {
  severityVector?: string
  severityScore?: number
}

// prefer the CVSS v3 vector, whose base score can be computed, and fall back to the v4 vector
function readSeverity(osvEntry: OsvEntry): Severity {
  // find the CVSS entries
  const severityEntries = osvEntry.severity ?? []
  const cvss3Entry = severityEntries.find(
    (severityEntry) => severityEntry.type === 'CVSS_V3',
  )
  const cvss4Entry = severityEntries.find(
    (severityEntry) => severityEntry.type === 'CVSS_V4',
  )

  // score the v3 vector
  if (cvss3Entry !== undefined) {
    const severityScore = computeCvss3BaseScore(cvss3Entry.score)
    return {
      severityVector: cvss3Entry.score,
      ...(severityScore === undefined ? {} : { severityScore }),
    }
  }

  // keep the v4 vector without a score
  if (cvss4Entry !== undefined) {
    return { severityVector: cvss4Entry.score }
  }
  return {}
}

// an affected package before its range types are checked against the contract
type UncheckedAffectedPackage = Omit<AffectedPackage, 'ranges'> & {
  ranges: { type: string; events: AdvisoryRangeEvent[] }[]
}

// map one affected item, or nothing when it names no package
function mapAffected(osvAffected: OsvAffected): UncheckedAffectedPackage[] {
  if (osvAffected.package === undefined) {
    return []
  }

  // rename last_affected to lastAffected in every range event
  const ranges = (osvAffected.ranges ?? []).map((osvRange) => ({
    type: osvRange.type,
    events: osvRange.events.map(mapRangeEvent),
  }))

  return [
    {
      ecosystem: osvAffected.package.ecosystem,
      name: osvAffected.package.name,
      ranges,
      versions: osvAffected.versions ?? [],
    },
  ]
}

// copy the event keys that are present, under their contract names
function mapRangeEvent(
  osvRangeEvent: z.infer<typeof osvRangeEventSchema>,
): AdvisoryRangeEvent {
  return {
    ...(osvRangeEvent.introduced === undefined
      ? {}
      : { introduced: osvRangeEvent.introduced }),
    ...(osvRangeEvent.fixed === undefined
      ? {}
      : { fixed: osvRangeEvent.fixed }),
    ...(osvRangeEvent.last_affected === undefined
      ? {}
      : { lastAffected: osvRangeEvent.last_affected }),
  }
}
