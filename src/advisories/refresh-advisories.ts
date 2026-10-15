// downloads the OSV bulk export, parses every entry and writes the advisory index and snapshot under the cache directory
import { mkdir, rename, rm } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import {
  type Advisory,
  type AdvisorySnapshot,
  advisorySnapshotSchema,
} from '@/shared/advisory'
import {
  type AdvisoryEcosystem,
  resolveAdvisoryCachePaths,
  resolveOsvArchiveUrl,
} from './cache-layout'
import { listAffectedNpmPackageNames } from './package-name'
import { parseOsvEntry } from './parse-osv'

// what to refresh and where. sourceUrl replaces the OSV export, and now replaces the clock
export interface RefreshAdvisoriesOptions {
  ecosystem: AdvisoryEcosystem
  cacheDir: string
  sourceUrl?: string
  now?: Date
}

// what a refresh wrote
export interface RefreshAdvisoriesResult {
  snapshot: AdvisorySnapshot
  indexPath: string
  snapshotPath: string
  packageCount: number
}

// one archive entry that did not parse, and why
export interface AdvisoryParseFailure {
  entryName: string
  message: string
}

// the most failures an error message lists in full
const listedFailureLimit = 20

/**
 * Reports every archive entry that did not parse, so a change in the OSV format fails the refresh loudly.
 */
export class AdvisoryParseError extends Error {
  readonly failures: AdvisoryParseFailure[]

  constructor(failures: AdvisoryParseFailure[]) {
    // list the first failures in the message and keep all of them on the error
    const listedFailures = failures
      .slice(0, listedFailureLimit)
      .map((failure) => `${failure.entryName}: ${failure.message}`)
    super(
      `${failures.length} OSV entries did not parse:\n${listedFailures.join('\n')}`,
    )
    this.name = 'AdvisoryParseError'
    this.failures = failures
  }
}

/**
 * Downloads the OSV export for an ecosystem and replaces the cached advisory index and snapshot.
 */
export async function refreshAdvisories({
  ecosystem,
  cacheDir,
  sourceUrl = resolveOsvArchiveUrl(ecosystem),
  now = new Date(),
}: RefreshAdvisoriesOptions): Promise<RefreshAdvisoriesResult> {
  // download the archive and fingerprint it
  const archiveBytes = await downloadArchive(sourceUrl)
  const sha256 = new Bun.CryptoHasher('sha256')
    .update(archiveBytes)
    .digest('hex')

  // parse every entry and stop on any failure before touching the cache
  const advisories = parseArchive(archiveBytes)
  const advisoriesByPackage = indexAdvisoriesByPackage(advisories)

  // describe the snapshot
  const snapshot = advisorySnapshotSchema.parse({
    fetchedAt: now.toISOString(),
    sourceUrl,
    entryCount: advisories.length,
    sha256,
  })

  // write both files beside their final paths, then move them into place
  const { ecosystemDirectory, indexPath, snapshotPath } =
    resolveAdvisoryCachePaths({ cacheDir, ecosystem })
  await mkdir(ecosystemDirectory, { recursive: true })
  await writeIndexFile({ indexPath, advisoriesByPackage })
  await replaceFile({
    path: snapshotPath,
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
  })

  return {
    snapshot,
    indexPath,
    snapshotPath,
    packageCount: advisoriesByPackage.size,
  }
}

/**
 * Groups advisories under the normalized name of every npm package they affect, sorted by name and then by advisory id.
 */
export function indexAdvisoriesByPackage(
  advisories: Advisory[],
): Map<string, Advisory[]> {
  // add each advisory under every npm package it affects
  const advisoriesByPackage = new Map<string, Advisory[]>()
  for (const advisory of advisories) {
    for (const packageName of listAffectedNpmPackageNames(advisory)) {
      const packageAdvisories = advisoriesByPackage.get(packageName) ?? []
      packageAdvisories.push(advisory)
      advisoriesByPackage.set(packageName, packageAdvisories)
    }
  }

  // sort packages by name and advisories by id so the output is stable
  const sortedPackageNames = [...advisoriesByPackage.keys()].sort()
  const sortedEntries = sortedPackageNames.map((packageName) => {
    const packageAdvisories = advisoriesByPackage.get(packageName) ?? []
    const sortedAdvisories = packageAdvisories.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    )
    return [packageName, sortedAdvisories] as const
  })
  return new Map(sortedEntries)
}

// fetch the archive and fail on any status other than success
async function downloadArchive(sourceUrl: string): Promise<Uint8Array> {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(
      `downloading ${sourceUrl} failed with status ${response.status}`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

// unzip the archive in memory and parse every JSON entry. any failure throws one error listing all of them
function parseArchive(archiveBytes: Uint8Array): Advisory[] {
  // extract only the JSON entries
  const archiveEntries = unzipSync(archiveBytes, {
    filter: (archiveFile) => archiveFile.name.endsWith('.json'),
  })

  // parse each entry and collect the failures
  const textDecoder = new TextDecoder()
  const advisories: Advisory[] = []
  const failures: AdvisoryParseFailure[] = []
  for (const [entryName, entryBytes] of Object.entries(archiveEntries)) {
    const entryText = textDecoder.decode(entryBytes)
    const parseOsvEntryResult = parseOsvEntry(readJson(entryText))
    if (parseOsvEntryResult.status === 'failed') {
      failures.push({ entryName, message: parseOsvEntryResult.message })
      continue
    }
    advisories.push(parseOsvEntryResult.advisory)
  }

  // fail the whole refresh when any entry did not parse
  if (failures.length > 0) {
    throw new AdvisoryParseError(failures)
  }
  return advisories
}

// parse JSON text, turning invalid JSON into undefined so the entry fails its schema check
function readJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// the index file and the advisories to write into it
interface WriteIndexFileOptions {
  indexPath: string
  advisoriesByPackage: Map<string, Advisory[]>
}

// stream the index as one JSON object keyed by package name, so the whole file is never one string
async function writeIndexFile({
  indexPath,
  advisoriesByPackage,
}: WriteIndexFileOptions): Promise<void> {
  // write one package per line into a temporary file
  const temporaryPath = `${indexPath}.${process.pid}.tmp`
  try {
    const indexWriter = Bun.file(temporaryPath).writer()
    let isFirstPackage = true
    indexWriter.write('{\n')
    for (const [packageName, packageAdvisories] of advisoriesByPackage) {
      const separator = isFirstPackage ? '' : ',\n'
      indexWriter.write(
        `${separator}${JSON.stringify(packageName)}: ${JSON.stringify(packageAdvisories)}`,
      )
      isFirstPackage = false
    }
    indexWriter.write('\n}\n')
    await indexWriter.end()

    // move the finished file over the old index
    await rename(temporaryPath, indexPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

// the file to replace and its new content
interface ReplaceFileOptions {
  path: string
  content: string
}

// write the content beside the path and move it into place, so readers never see half a file
async function replaceFile({
  path,
  content,
}: ReplaceFileOptions): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`
  try {
    await Bun.write(temporaryPath, content)
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
