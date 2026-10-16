// groups the advisories that match one package version by overlapping ids and aliases, so each connected set of ids becomes one finding
import type { Advisory } from '@/shared/advisory'
import { compareCodeUnitOrder } from './affected-range'

// the prefix of a GitHub advisory id, the id a group is named after when it has one
const githubAdvisoryIdPrefix = 'GHSA-'

// one advisory that covers a package version, with the fixed events of the ranges that covered it
export interface MatchedAdvisory {
  advisory: Advisory
  fixedVersions: string[]
}

// the parent map of the union-find and the two ids whose groups to join
interface UniteAdvisoryIdsOptions {
  parentById: Map<string, string>
  first: string
  second: string
}

/** Joins the matched advisories whose ids or aliases overlap into alias groups, one per connected set of ids. */
export function groupMatchedAdvisories(
  matchedAdvisories: MatchedAdvisory[],
): MatchedAdvisory[][] {
  // join every alias of each advisory with the advisory's own id
  const parentById = new Map<string, string>()
  for (const { advisory } of matchedAdvisories) {
    for (const alias of advisory.aliases) {
      uniteAdvisoryIds({ parentById, first: advisory.id, second: alias })
    }
  }

  // collect the advisories under the root id of their group, in matched order
  const aliasGroupsByRootId = new Map<string, MatchedAdvisory[]>()
  for (const matchedAdvisory of matchedAdvisories) {
    const rootId = findRootAdvisoryId(parentById, matchedAdvisory.advisory.id)
    const aliasGroup = aliasGroupsByRootId.get(rootId) ?? []
    aliasGroup.push(matchedAdvisory)
    aliasGroupsByRootId.set(rootId, aliasGroup)
  }
  return [...aliasGroupsByRootId.values()]
}

/** Lists every id and alias of an alias group once, in code unit order. */
export function listGroupIds(aliasGroup: MatchedAdvisory[]): string[] {
  const groupIds = new Set<string>()
  for (const { advisory } of aliasGroup) {
    groupIds.add(advisory.id)
    for (const alias of advisory.aliases) {
      groupIds.add(alias)
    }
  }
  return [...groupIds].sort((first, second) =>
    compareCodeUnitOrder({ first, second }),
  )
}

/** Picks the id a group is named after: its first GHSA id in code unit order, else its first id. */
export function pickAdvisoryId(groupIds: string[]): string {
  // sort a copy of the ids in code unit order
  const sortedGroupIds = [...groupIds].sort((first, second) =>
    compareCodeUnitOrder({ first, second }),
  )
  const githubAdvisoryId = sortedGroupIds.find((groupId) =>
    groupId.startsWith(githubAdvisoryIdPrefix),
  )
  const advisoryId = githubAdvisoryId ?? sortedGroupIds[0]
  if (advisoryId === undefined) {
    throw new Error('an alias group holds no advisory id')
  }
  return advisoryId
}

// join the groups of two ids under the root of the first
function uniteAdvisoryIds({
  parentById,
  first,
  second,
}: UniteAdvisoryIdsOptions): void {
  const firstRootId = findRootAdvisoryId(parentById, first)
  const secondRootId = findRootAdvisoryId(parentById, second)
  if (firstRootId !== secondRootId) {
    parentById.set(secondRootId, firstRootId)
  }
}

// follow the parent links of an id to the root of its group. an id not seen before is its own root
function findRootAdvisoryId(
  parentById: Map<string, string>,
  advisoryId: string,
): string {
  const parentId = parentById.get(advisoryId)
  if (parentId === undefined || parentId === advisoryId) {
    parentById.set(advisoryId, advisoryId)
    return advisoryId
  }
  return findRootAdvisoryId(parentById, parentId)
}
