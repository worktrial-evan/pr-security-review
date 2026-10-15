// tests lookups over the committed benchmark subset of advisories
import { beforeAll, describe, expect, test } from 'bun:test'
import type { Advisory, AdvisoryStore } from '@/shared/advisory'
import { loadAdvisoryStore } from './advisory-store'
import { resolveAdvisoryCachePaths } from './cache-layout'
import { listAffectedNpmPackageNames } from './package-name'
import {
  benchmarkAdvisoryCacheDir,
  benchmarkAdvisoryPackageNames,
} from './write-advisory-subset'

// the store loaded from the committed subset
let subsetStore: AdvisoryStore
beforeAll(async () => {
  subsetStore = await loadAdvisoryStore(benchmarkAdvisoryCacheDir)
})

// say whether any range of the advisory ends at a last affected version
function hasLastAffectedRange(advisory: Advisory): boolean {
  const ranges = advisory.affected.flatMap(
    (affectedPackage) => affectedPackage.ranges,
  )
  return ranges.some((range) =>
    range.events.some((event) => event.lastAffected !== undefined),
  )
}

describe('benchmark advisory subset', () => {
  test.each([...benchmarkAdvisoryPackageNames])(
    'returns advisories affecting %s',
    async (packageName) => {
      const packageAdvisories = await subsetStore.getByPackage(packageName)
      expect(packageAdvisories.length).toBeGreaterThan(0)
      for (const advisory of packageAdvisories) {
        expect(listAffectedNpmPackageNames(advisory)).toContain(packageName)
      }
    },
  )

  test('holds exactly the listed packages', async () => {
    const { indexPath } = resolveAdvisoryCachePaths({
      cacheDir: benchmarkAdvisoryCacheDir,
      ecosystem: 'npm',
    })
    const subsetIndex: Record<string, unknown> =
      await Bun.file(indexPath).json()
    expect(Object.keys(subsetIndex).toSorted()).toEqual(
      [...benchmarkAdvisoryPackageNames].toSorted(),
    )
  })

  test('includes a withdrawn entry, a last_affected range and an unreviewed entry', async () => {
    const mustacheAdvisories = await subsetStore.getByPackage('mustache')
    const xmldomAdvisories = await subsetStore.getByPackage('xmldom')
    const fakerAdvisories = await subsetStore.getByPackage('faker.js')
    expect(
      mustacheAdvisories.some((advisory) => advisory.withdrawn !== undefined),
    ).toBe(true)
    expect(xmldomAdvisories.some(hasLastAffectedRange)).toBe(true)
    expect(fakerAdvisories.some((advisory) => !advisory.isGithubReviewed)).toBe(
      true,
    )
  })

  test('counts its own advisories and keeps the source snapshot date', async () => {
    const allAdvisories = await Promise.all(
      benchmarkAdvisoryPackageNames.map((packageName) =>
        subsetStore.getByPackage(packageName),
      ),
    )
    const advisoryIds = new Set(
      allAdvisories.flat().map((advisory) => advisory.id),
    )
    expect(subsetStore.snapshot.entryCount).toBe(advisoryIds.size)
    expect(Date.parse(subsetStore.snapshot.fetchedAt)).not.toBeNaN()
  })

  test('finds a package by a differently cased name', async () => {
    const lodashAdvisories = await subsetStore.getByPackage('lodash')
    expect(await subsetStore.getByPackage('Lodash')).toEqual(lodashAdvisories)
  })
})
