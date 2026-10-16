// matches one dependency version against an affected entry's versions list and ranges, comparing versions with semver precedence
import semver from 'semver'
import type {
  AdvisoryRange,
  AdvisoryRangeEvent,
  AffectedPackage,
} from '@/shared/advisory'

// the two version strings to order
export interface CompareVersionsOptions {
  first: string
  second: string
}

// the version to check and the affected entry to check it against
export interface MatchAffectedPackageOptions {
  version: string
  affectedPackage: AffectedPackage
}

// whether the entry covers the version, the fixed events of the ranges that covered it, and the GIT ranges skipped
export interface AffectedPackageMatch {
  isAffected: boolean
  fixedVersions: string[]
  ignoredGitRangeCount: number
}

// the version and the SEMVER or ECOSYSTEM range to check it against
interface VersionInRangeOptions {
  version: string
  advisoryRange: AdvisoryRange
}

// the event kinds in the order they sort at one version: introduced opens an interval, lastAffected and fixed close one
const rangeEventKinds = ['introduced', 'lastAffected', 'fixed'] as const
type RangeEventKind = (typeof rangeEventKinds)[number]

// one range event reduced to its single kind and the version it names
interface RangeEventPoint {
  kind: RangeEventKind
  version: string
}

// the two event points to order
interface CompareRangeEventPointsOptions {
  first: RangeEventPoint
  second: RangeEventPoint
}

// the version to check, the introduced version that opens an interval and the fixed or lastAffected point that
// closes it, if any
interface VersionIntervalOptions {
  version: string
  introduced: string
  upperEventPoint: RangeEventPoint | undefined
}

// the introduced value that marks the beginning of every range
const rangeBeginning = '0'

/** Matches a version against one affected entry: its listed versions and its SEMVER and ECOSYSTEM ranges. */
export function matchAffectedPackage({
  version,
  affectedPackage,
}: MatchAffectedPackageOptions): AffectedPackageMatch {
  // a listed version is affected by string equality
  const isListedVersion = affectedPackage.versions.includes(version)

  // walk every range, skip GIT ranges and collect the fixed events of the ranges that cover the version
  let ignoredGitRangeCount = 0
  let isInAnyRange = false
  const matchedFixedVersions: string[] = []
  for (const advisoryRange of affectedPackage.ranges) {
    if (advisoryRange.type === 'GIT') {
      ignoredGitRangeCount += 1
      continue
    }
    if (!isVersionInRange({ version, advisoryRange })) {
      continue
    }
    isInAnyRange = true
    matchedFixedVersions.push(...listFixedVersions(advisoryRange))
  }

  return {
    isAffected: isListedVersion || isInAnyRange,
    fixedVersions: sortUniqueVersions(matchedFixedVersions),
    ignoredGitRangeCount,
  }
}

/** Compares two versions: 0 when equal, semver order when both parse, undefined when the order cannot be decided. */
export function compareVersions({
  first,
  second,
}: CompareVersionsOptions): number | undefined {
  if (first === second) {
    return 0
  }
  if (isVersionUnparseable(first) || isVersionUnparseable(second)) {
    return undefined
  }
  return semver.compare(first, second)
}

/** Reports whether a version is not valid semver. */
export function isVersionUnparseable(version: string): boolean {
  return semver.valid(version) === null
}

/** Orders two versions for sorting: semver order when both parse, parseable before unparseable, else code unit order. */
export function compareVersionOrder({
  first,
  second,
}: CompareVersionsOptions): number {
  // order the parseable version first when only one parses
  const isFirstUnparseable = isVersionUnparseable(first)
  const isSecondUnparseable = isVersionUnparseable(second)
  if (isFirstUnparseable !== isSecondUnparseable) {
    return isFirstUnparseable ? 1 : -1
  }

  // order two parseable versions by semver precedence, then by code units when only their build metadata differs
  if (!isFirstUnparseable) {
    const semverPrecedence = semver.compare(first, second)
    if (semverPrecedence !== 0) {
      return semverPrecedence
    }
    return compareCodeUnitOrder({ first, second })
  }

  // order two unparseable versions by their code units
  return compareCodeUnitOrder({ first, second })
}

/** Orders two strings by their code units, the order a plain string comparison gives. */
export function compareCodeUnitOrder({
  first,
  second,
}: CompareVersionsOptions): number {
  if (first < second) {
    return -1
  }
  return first > second ? 1 : 0
}

/** Returns the versions deduplicated and sorted in version order. */
export function sortUniqueVersions(versions: string[]): string[] {
  const uniqueVersions = [...new Set(versions)]
  return uniqueVersions.sort((first, second) =>
    compareVersionOrder({ first, second }),
  )
}

// decide whether the version falls in any interval of one range. each introduced point opens an interval that the
// next fixed or lastAffected point after it closes
function isVersionInRange({
  version,
  advisoryRange,
}: VersionInRangeOptions): boolean {
  const rangeEventPoints = listRangeEventPoints(advisoryRange.events)
  const orderedEventPoints = orderRangeEventPoints(rangeEventPoints)
  for (const [i, eventPoint] of orderedEventPoints.entries()) {
    if (eventPoint.kind !== 'introduced') {
      continue
    }
    const laterEventPoints = orderedEventPoints.slice(i + 1)
    const upperEventPoint = laterEventPoints.find(
      (laterEventPoint) => laterEventPoint.kind !== 'introduced',
    )
    const isInInterval = isVersionInInterval({
      version,
      introduced: eventPoint.version,
      upperEventPoint,
    })
    if (isInInterval) {
      return true
    }
  }
  return false
}

// split every event into one point per key it holds
function listRangeEventPoints(events: AdvisoryRangeEvent[]): RangeEventPoint[] {
  return events.flatMap(listEventPoints)
}

// list the points of one event in the order introduced, lastAffected, fixed
function listEventPoints(event: AdvisoryRangeEvent): RangeEventPoint[] {
  const eventPoints: RangeEventPoint[] = []
  for (const kind of rangeEventKinds) {
    const eventVersion = event[kind]
    if (eventVersion !== undefined) {
      eventPoints.push({ kind, version: eventVersion })
    }
  }
  return eventPoints
}

// sort by version with '0' first and, at equal versions, introduced before lastAffected before fixed. keep document
// order when any event version other than '0' does not parse
function orderRangeEventPoints(
  eventPoints: RangeEventPoint[],
): RangeEventPoint[] {
  const isEveryEventPointOrderable = eventPoints.every(isEventPointOrderable)
  if (!isEveryEventPointOrderable) {
    return eventPoints
  }
  return [...eventPoints].sort((first, second) =>
    compareRangeEventPoints({ first, second }),
  )
}

// report whether a point can be placed by version: the range beginning or a version that parses
function isEventPointOrderable(eventPoint: RangeEventPoint): boolean {
  return (
    isRangeBeginning(eventPoint) || !isVersionUnparseable(eventPoint.version)
  )
}

// report whether a point is the introduced '0' that begins a range
function isRangeBeginning(eventPoint: RangeEventPoint): boolean {
  return (
    eventPoint.kind === 'introduced' && eventPoint.version === rangeBeginning
  )
}

// order two orderable points: the range beginning first, then semver precedence, then kind, then code units
function compareRangeEventPoints({
  first,
  second,
}: CompareRangeEventPointsOptions): number {
  // put the range beginning before every other point
  const isFirstBeginning = isRangeBeginning(first)
  const isSecondBeginning = isRangeBeginning(second)
  if (isFirstBeginning && isSecondBeginning) {
    return 0
  }
  if (isFirstBeginning) {
    return -1
  }
  if (isSecondBeginning) {
    return 1
  }

  // order by semver precedence, which ignores build metadata
  const semverPrecedence = semver.compare(first.version, second.version)
  if (semverPrecedence !== 0) {
    return semverPrecedence
  }

  // at one version, order introduced before lastAffected before fixed
  const kindOrder =
    rangeEventKinds.indexOf(first.kind) - rangeEventKinds.indexOf(second.kind)
  if (kindOrder !== 0) {
    return kindOrder
  }

  // break a build metadata tie by code units
  return compareCodeUnitOrder({ first: first.version, second: second.version })
}

// decide whether the version is at or above the introduced version and under the upper point when there is one
function isVersionInInterval({
  version,
  introduced,
  upperEventPoint,
}: VersionIntervalOptions): boolean {
  // the range beginning covers every version that parses
  const isAtOrAboveIntroduced =
    introduced === rangeBeginning
      ? !isVersionUnparseable(version)
      : isComparisonAtLeast(
          compareVersions({ first: version, second: introduced }),
        )
  if (!isAtOrAboveIntroduced) {
    return false
  }

  // an interval with no upper point is open-ended
  if (upperEventPoint === undefined) {
    return true
  }

  // a fixed point excludes itself and a lastAffected point includes itself. an undecided comparison counts as not
  // affected
  const upperComparison = compareVersions({
    first: version,
    second: upperEventPoint.version,
  })
  if (upperComparison === undefined) {
    return false
  }
  return upperEventPoint.kind === 'fixed'
    ? upperComparison < 0
    : upperComparison <= 0
}

// read a comparison as at or above, where an undecided comparison counts as not satisfied
function isComparisonAtLeast(comparison: number | undefined): boolean {
  return comparison !== undefined && comparison >= 0
}

// list every fixed event of one range
function listFixedVersions(advisoryRange: AdvisoryRange): string[] {
  const fixedVersions: string[] = []
  for (const event of advisoryRange.events) {
    if (event.fixed !== undefined) {
      fixedVersions.push(event.fixed)
    }
  }
  return fixedVersions
}
