// builds summary and remediation text from a packet alone, for fallbacks and for pre-existing findings
import type { DependencyFinding, Finding } from '@/shared/finding'
import type { SummaryPacket } from './summary-packet'
import type { ModelSummary } from './validate'

/**
 * Builds a summary and remediation for a finding from its packet, naming only identifiers the packet holds.
 */
export function buildTemplateSummary(packet: SummaryPacket): ModelSummary {
  // write the text for the finding's detector
  const { finding } = packet
  if (finding.detector === 'dependency') {
    return {
      summary: `${finding.packageName} ${finding.version} is affected by ${finding.advisoryId}. ${describeReachability(finding)}`,
      remediation: buildDependencyRemediation(finding),
    }
  }
  if (finding.detector === 'code-review') {
    return {
      summary: `${describeFinding(finding)} has ${finding.severity} severity.`,
      remediation: `Change the code at ${describeLocation(finding)} so that untrusted input cannot reach the sink, then add a test for that flow.`,
    }
  }
  return {
    summary: `${describeFinding(finding)} has ${finding.severity} severity.`,
    remediation:
      'Revoke the credential, remove it from the code and load it from a secret store or an environment variable instead.',
  }
}

/**
 * Builds the one-line summary of a finding that was present before the pull request, with the template remediation.
 */
export function buildPreExistingSummary(packet: SummaryPacket): ModelSummary {
  const templateSummary = buildTemplateSummary(packet)
  return {
    summary: `${describeFinding(packet.finding)} was present before this pull request.`,
    remediation: templateSummary.remediation,
  }
}

/**
 * Returns the fixed version to upgrade to: the lowest fixed version above the installed one, else the first listed.
 */
export function pickFixedVersion(
  finding: DependencyFinding,
): string | undefined {
  // order the fixed versions lowest first
  const orderedFixedVersions = [...finding.fixedVersions].sort(
    (firstVersion, secondVersion) =>
      Bun.semver.order(firstVersion, secondVersion),
  )

  // take the lowest one above the installed version
  const higherFixedVersion = orderedFixedVersions.find(
    (fixedVersion) => Bun.semver.order(fixedVersion, finding.version) > 0,
  )
  return higherFixedVersion ?? finding.fixedVersions[0]
}

// name the finding by its package and advisory, its weakness or its rule, and its location
function describeFinding(finding: Finding): string {
  if (finding.detector === 'dependency') {
    return `${finding.packageName} ${finding.version} with advisory ${finding.advisoryId}`
  }
  if (finding.detector === 'code-review') {
    return `The ${finding.vulnerabilityType} weakness at ${describeLocation(finding)}`
  }
  return `The credential matching the ${finding.ruleId} rule at ${describeLocation(finding)}`
}

// say how the vulnerable dependency reaches the code
function describeReachability(finding: DependencyFinding): string {
  if (finding.reachability === 'direct-imported') {
    return 'It is a direct dependency that the code imports.'
  }
  if (finding.reachability === 'direct-unused') {
    return 'It is a direct dependency that the code does not import.'
  }

  // name the direct dependency that pulls it in, when the path has one
  const directDependencyKey = finding.dependencyPath[0]
  if (!directDependencyKey || finding.dependencyPath.length < 2) {
    return 'It is a transitive dependency.'
  }
  return `It is a transitive dependency through ${directDependencyKey}.`
}

// state the upgrade as an action, or the removal when no fix is published
function buildDependencyRemediation(finding: DependencyFinding): string {
  // pick the version to upgrade to
  const fixedVersion = pickFixedVersion(finding)
  if (!fixedVersion) {
    return `No fixed version is published. Remove ${finding.packageName} or replace it with a package the advisory does not affect.`
  }
  return `Upgrade ${finding.packageName} to ${fixedVersion} or later.`
}

// name the file and line of a finding
function describeLocation(finding: Finding): string {
  if (!finding.file) {
    return 'an unknown location'
  }
  if (finding.startLine === undefined) {
    return finding.file
  }
  return `${finding.file} line ${finding.startLine}`
}
