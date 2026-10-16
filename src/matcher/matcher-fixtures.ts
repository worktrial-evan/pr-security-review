// reads the fixture advisory set under src/matcher/fixtures into an in-memory AdvisoryStore and builds dependency sets for the tests in this module
import { join } from 'node:path'
import semver from 'semver'
import { z } from 'zod'
import {
  type Advisory,
  type AdvisoryStore,
  advisorySchema,
} from '@/shared/advisory'
import type {
  DependencyDiff,
  DependencySet,
  DependencyVersion,
} from '@/shared/dependency'
import { normalizePackageName } from '@/shared/package-name'

// the fixture advisory set, one Advisory per entry
export const fixtureAdvisoriesPath = join(
  import.meta.dir,
  'fixtures',
  'advisories.json',
)

// the advisory list as the fixture file holds it
const fixtureAdvisoriesSchema = z.array(advisorySchema)

// the snapshot the fixture store reports
const fixtureSnapshot = {
  fetchedAt: '2024-06-01T00:00:00Z',
  sourceUrl: 'https://example.com/npm/all.zip',
  entryCount: 0,
  sha256: '0'.repeat(64),
}

/** Reads the fixture advisory set through the advisory contract. */
export async function readFixtureAdvisories(): Promise<Advisory[]> {
  const fixtureEntries: unknown = await Bun.file(fixtureAdvisoriesPath).json()
  return fixtureAdvisoriesSchema.parse(fixtureEntries)
}

/** Serves a list of advisories as an AdvisoryStore keyed by every affected name, whatever its ecosystem. */
export function createFixtureAdvisoryStore(
  advisories: Advisory[],
): AdvisoryStore {
  // index each advisory under every name it affects
  const advisoriesByPackage = new Map<string, Advisory[]>()
  for (const advisory of advisories) {
    const affectedNames = new Set(
      advisory.affected.map((affectedPackage) =>
        normalizePackageName(affectedPackage.name),
      ),
    )
    for (const affectedName of affectedNames) {
      const packageAdvisories = advisoriesByPackage.get(affectedName) ?? []
      packageAdvisories.push(advisory)
      advisoriesByPackage.set(affectedName, packageAdvisories)
    }
  }

  return {
    snapshot: { ...fixtureSnapshot, entryCount: advisories.length },
    async getByPackage(packageName) {
      const packageAdvisories =
        advisoriesByPackage.get(normalizePackageName(packageName)) ?? []
      return structuredClone(packageAdvisories)
    },
  }
}

// the name and version of a fixture dependency, with any other field overridden
export interface CreateDependencyVersionOptions
  extends Partial<DependencyVersion> {
  name: string
  version: string
}

/** Builds a prod, direct, non-workspace dependency version with no dependencies unless overridden. */
export function createDependencyVersion({
  name,
  version,
  ...overrides
}: CreateDependencyVersionOptions): DependencyVersion {
  return {
    name,
    version,
    scope: 'prod',
    isDirect: true,
    isWorkspace: false,
    isVersionUnparseable: semver.valid(version) === null,
    dependencyKeys: [],
    ...overrides,
  }
}

/** Builds a bun dependency set holding the given versions grouped by name. */
export function createDependencySet(
  dependencyVersions: DependencyVersion[],
): DependencySet {
  // group the versions under their names in the order given
  const versionsByDependency = new Map<string, DependencyVersion[]>()
  for (const dependencyVersion of dependencyVersions) {
    const packageVersions =
      versionsByDependency.get(dependencyVersion.name) ?? []
    packageVersions.push(dependencyVersion)
    versionsByDependency.set(dependencyVersion.name, packageVersions)
  }

  // every direct version names a direct dependency
  const directDependencyNames = new Set(
    dependencyVersions
      .filter((dependencyVersion) => dependencyVersion.isDirect)
      .map((dependencyVersion) => dependencyVersion.name),
  )
  return {
    lockfileKind: 'bun',
    lockfilePath: 'bun.lock',
    versionsByDependency,
    directDependencyNames,
  }
}

/** Builds a diff with nothing added, removed or changed. */
export function createEmptyDependencyDiff(): DependencyDiff {
  return { added: [], removed: [], changed: [], unchangedCount: 0 }
}
