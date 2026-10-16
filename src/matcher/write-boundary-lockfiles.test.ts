// tests the boundary versions the boundary lockfile generator derives from a package's advisories
import { describe, expect, test } from 'bun:test'
import type { Advisory, AdvisoryRangeEvent } from '@/shared/advisory'
import { readFixtureAdvisories } from './matcher-fixtures'
import { listBoundaryVersions } from './write-boundary-lockfiles'

describe('listBoundaryVersions', () => {
  test('adds the next patch and a prerelease of every release event and leaves out introduced 0', async () => {
    const advisories = await readFixtureAdvisories()
    const boundaryVersions = listBoundaryVersions({
      packageName: 'range-kit',
      advisories: advisories.filter((advisory) =>
        advisory.affected.some(
          (affectedPackage) => affectedPackage.name === 'range-kit',
        ),
      ),
    })
    expect(boundaryVersions).toEqual([
      '1.0.1-rc.1',
      '1.0.1',
      '1.0.2',
      '1.0.5-rc.1',
      '1.0.5',
      '1.0.6',
      '2.0.0-rc.1',
      '2.0.0',
      '2.0.1',
      '2.0.3-rc.1',
      '2.0.3',
      '2.0.4',
    ])
  })

  test('pairs a prerelease event with its release and keeps a listed version', async () => {
    const prereleaseAdvisory = await createRangeAdvisory({
      packageName: 'pre-kit',
      events: [{ introduced: '2.0.0-beta.1' }],
      versions: ['1.0.0.1'],
    })
    const prereleaseVersions = listBoundaryVersions({
      packageName: 'pre-kit',
      advisories: [prereleaseAdvisory],
    })
    expect(prereleaseVersions).toEqual(['2.0.0-beta.1', '2.0.0', '1.0.0.1'])
  })

  test('keeps an event version with build metadata and builds no neighbour for it', async () => {
    const buildMetadataAdvisory = await createRangeAdvisory({
      packageName: 'build-kit',
      events: [{ introduced: '0' }, { fixed: '1.0.0+build' }],
    })
    const buildMetadataVersions = listBoundaryVersions({
      packageName: 'build-kit',
      advisories: [buildMetadataAdvisory],
    })
    expect(buildMetadataVersions).toEqual(['1.0.0+build'])
  })

  test('builds the neighbours of a v-prefixed event from its parsed version', async () => {
    const prefixedAdvisory = await createRangeAdvisory({
      packageName: 'prefix-kit',
      events: [{ introduced: 'v1.0.0' }],
    })
    const prefixedVersions = listBoundaryVersions({
      packageName: 'prefix-kit',
      advisories: [prefixedAdvisory],
    })
    expect(prefixedVersions).toEqual(['1.0.0-rc.1', 'v1.0.0', '1.0.1'])
  })

  test('Combined event: lists the introduced and the fixed version of one event with their neighbours', async () => {
    const combinedEventAdvisory = await createRangeAdvisory({
      packageName: 'combined-kit',
      events: [{ introduced: '1.0.0', fixed: '1.5.0' }],
    })
    const combinedEventVersions = listBoundaryVersions({
      packageName: 'combined-kit',
      advisories: [combinedEventAdvisory],
    })
    expect(combinedEventVersions).toEqual([
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.5.0-rc.1',
      '1.5.0',
      '1.5.1',
    ])
  })

  test('ignores entries of other ecosystems and other names', async () => {
    const advisories = await readFixtureAdvisories()
    const otherVersions = listBoundaryVersions({
      packageName: 'pypi-kit',
      advisories,
    })
    expect(otherVersions).toEqual([])
  })
})

// the package name, the events of one SEMVER range and the listed versions of a single-entry advisory
interface CreateRangeAdvisoryOptions {
  packageName: string
  events: AdvisoryRangeEvent[]
  versions?: string[]
}

// build one npm advisory with a single SEMVER range from the first fixture advisory
async function createRangeAdvisory({
  packageName,
  events,
  versions = [],
}: CreateRangeAdvisoryOptions): Promise<Advisory> {
  const [firstAdvisory] = await readFixtureAdvisories()
  if (firstAdvisory === undefined) {
    throw new Error('the fixture advisory set is empty')
  }
  return {
    ...firstAdvisory,
    affected: [
      {
        ecosystem: 'npm',
        name: packageName,
        ranges: [{ type: 'SEMVER', events }],
        versions,
      },
    ],
  }
}
