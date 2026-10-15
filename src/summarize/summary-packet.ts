// builds the per-finding packet a summary is written from: its fields, its fences and the identifiers a summary may name
import {
  describeFence,
  fenceUntrustedContent,
  type UntrustedFence,
} from '@/prompts/fence-untrusted'
import type { Advisory } from '@/shared/advisory'
import type { Finding, ScaFinding } from '@/shared/finding'
import { normalizePackageName } from '@/shared/package-name'
import {
  extractAdvisoryIds,
  extractVersions,
  type SummaryGrounding,
} from './validate'

// everything known about one finding when its summary is written
export interface SummaryPacket {
  finding: Finding
  advisory: Advisory | undefined
  fieldLines: string[]
  fences: UntrustedFence[]
  grounding: SummaryGrounding
}

export interface BuildSummaryPacketOptions {
  finding: Finding
  advisoriesById: ReadonlyMap<string, Advisory>
}

export interface RenderSummaryPacketsOptions {
  packets: SummaryPacket[]
  violationsByFindingId?: ReadonlyMap<string, string[]>
}

/**
 * Builds the packet for one finding from its own fields and, for a dependency finding, its advisory.
 */
export function buildSummaryPacket({
  finding,
  advisoriesById,
}: BuildSummaryPacketOptions): SummaryPacket {
  // look up the advisory of a dependency finding
  const advisory =
    finding.detector === 'sca'
      ? advisoriesById.get(finding.advisoryId)
      : undefined

  // render the fields and fence the untrusted text
  const fieldLines = renderFieldLines({ finding, advisory })
  const fences = buildFences({ finding, advisory })

  // derive the identifiers a summary may name from everything the model sees
  const grounding = buildGrounding({ finding, advisory, fieldLines, fences })
  return { finding, advisory, fieldLines, fences, grounding }
}

/**
 * Renders packets as the user text of one call, each under a heading with its finding id.
 */
export function renderSummaryPackets({
  packets,
  violationsByFindingId,
}: RenderSummaryPacketsOptions): string {
  const packetSections = packets.map((packet) => {
    // list the fields, then the fenced text
    const fenceTexts = packet.fences.map((fence) => fence.text)
    const sectionLines = [
      `## Finding ${packet.finding.id}`,
      ...packet.fieldLines,
      ...fenceTexts,
    ]

    // append the violations of a previous summary on a retry
    const violations = violationsByFindingId?.get(packet.finding.id) ?? []
    if (violations.length > 0) {
      sectionLines.push(
        'Your previous summary for this finding was rejected:',
        ...violations.map((violation) => `- ${violation}`),
      )
    }
    return sectionLines.join('\n')
  })
  return packetSections.join('\n\n')
}

/**
 * Returns the fence description of every fence in the packets, one per line.
 */
export function describePacketFences(packets: SummaryPacket[]): string {
  const fenceDescriptions = packets.flatMap((packet) =>
    packet.fences.map(describeFence),
  )
  return fenceDescriptions.join('\n')
}

// the finding and advisory a packet is built from
interface PacketSourceOptions {
  finding: Finding
  advisory: Advisory | undefined
}

// render the finding's own fields as key and value lines, skipping empty ones
function renderFieldLines({
  finding,
  advisory,
}: PacketSourceOptions): string[] {
  // the fields every finding has
  const fieldEntries: [string, string | number | undefined][] = [
    ['detector', finding.detector],
    ['severity', finding.severity],
    ['title', finding.title],
    ['file', finding.file],
    ['start line', finding.startLine],
    ['end line', finding.endLine],
  ]

  // the fields of each detector
  if (finding.detector === 'sca') {
    fieldEntries.push(...renderScaFieldEntries({ finding, advisory }))
  }
  if (finding.detector === 'code-review') {
    fieldEntries.push(
      ['cwe', finding.cwe],
      ['source to sink', finding.sourceToSink],
    )
  }
  if (finding.detector === 'secrets') {
    fieldEntries.push(['rule', finding.ruleId])
  }

  // drop the fields with no value
  const presentFieldEntries = fieldEntries.filter(
    ([, fieldValue]) => fieldValue !== undefined && fieldValue !== '',
  )
  return presentFieldEntries.map(
    ([fieldName, fieldValue]) => `${fieldName}: ${fieldValue}`,
  )
}

// the dependency finding and its advisory
interface ScaPacketSourceOptions {
  finding: ScaFinding
  advisory: Advisory | undefined
}

// the field entries of a dependency finding, with the advisory reference urls
function renderScaFieldEntries({
  finding,
  advisory,
}: ScaPacketSourceOptions): [string, string | number | undefined][] {
  const referenceUrls =
    advisory?.references.map((reference) => reference.url) ?? []
  return [
    ['package', finding.packageName],
    ['installed version', finding.version],
    ['advisory id', finding.advisoryId],
    ['aliases', finding.aliases.join(', ')],
    ['dependency scope', finding.dependencyScope],
    ['reachability', finding.reachability],
    ['dependency path', finding.dependencyPath.join(' > ')],
    ['fixed versions', finding.fixedVersions.join(', ')],
    ['cvss score', finding.cvssScore],
    ['references', referenceUrls.join(', ')],
  ]
}

// fence the evidence lines of a code finding and the advisory text of a dependency finding
function buildFences({
  finding,
  advisory,
}: PacketSourceOptions): UntrustedFence[] {
  // fence the evidence lines as one block
  const fences: UntrustedFence[] = []
  if (finding.detector === 'code-review' && finding.evidence.length > 0) {
    const evidenceContent = finding.evidence.join('\n')
    fences.push(
      fenceUntrustedContent({ label: 'evidence', content: evidenceContent }),
    )
  }

  // fence the advisory summary and details as one block
  if (advisory) {
    const advisoryContent = `summary: ${advisory.summary}\ndetails: ${advisory.details}`
    fences.push(
      fenceUntrustedContent({ label: 'advisory', content: advisoryContent }),
    )
  }
  return fences
}

// the fields and fences a grounding is derived from
interface BuildGroundingOptions extends PacketSourceOptions {
  fieldLines: string[]
  fences: UntrustedFence[]
}

// collect the versions, ids, package names and urls a summary may name
function buildGrounding({
  finding,
  advisory,
  fieldLines,
  fences,
}: BuildGroundingOptions): SummaryGrounding {
  // scan every line the model sees for versions and advisory ids
  const fenceContents = fences.map((fence) => fence.text)
  const packetText = [...fieldLines, ...fenceContents].join('\n')
  const versions = extractVersions(packetText)
  const advisoryIds = extractAdvisoryIds(packetText)

  // allow the package and the names on its dependency path
  const packageNames = new Set<string>()
  if (finding.detector === 'sca') {
    for (const listedVersion of [finding.version, ...finding.fixedVersions]) {
      versions.add(listedVersion)
    }
    for (const listedAdvisoryId of [finding.advisoryId, ...finding.aliases]) {
      advisoryIds.add(listedAdvisoryId.toUpperCase())
    }
    packageNames.add(normalizePackageName(finding.packageName))
    for (const dependencyKey of finding.dependencyPath) {
      packageNames.add(normalizePackageName(toPackageName(dependencyKey)))
    }
  }

  // allow only the advisory reference urls
  const referenceUrls =
    advisory?.references.map((reference) => reference.url) ?? []
  return { versions, advisoryIds, packageNames, urls: new Set(referenceUrls) }
}

// return the name part of a name@version dependency key, keeping a scope's leading @
function toPackageName(dependencyKey: string): string {
  const versionSeparatorIndex = dependencyKey.lastIndexOf('@')
  if (versionSeparatorIndex <= 0) {
    return dependencyKey
  }
  return dependencyKey.slice(0, versionSeparatorIndex)
}
