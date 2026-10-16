// the osv-scanner oracle: finds the binary, writes the offline database from the advisory index, runs the scan and parses its JSON output into match keys
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { zipSync } from 'fflate'
import { z } from 'zod'
import type {
  Advisory,
  AdvisoryRangeEvent,
  AdvisoryRangeType,
  AffectedPackage,
} from '@/shared/advisory'
import { compareCodeUnitOrder } from './affected-range'
import type {
  OracleMatch,
  OraclePackage,
  OracleResult,
} from './dependency-finding'

// the binary the oracle runs
export const oracleBinaryName = 'osv-scanner'

// the archive under the database directory that osv-scanner reads for npm in offline mode
export const oracleDatabaseArchivePath = join('osv-scalibr', 'npm', 'all.zip')

// the start of the stderr line osv-scanner prints when it cannot load the local database
const databaseLoadFailureText = 'could not load db for'

// the start of the stderr line osv-scanner prints when the lockfile resolves no packages
const noPackageSourcesText = 'No package sources found'

// the advisories to write and the directory osv-scanner is pointed at
export interface WriteOracleDatabaseOptions {
  advisories: Advisory[]
  databaseDirectory: string
}

// where the archive landed and how many distinct advisories it holds
export interface WriteOracleDatabaseResult {
  archivePath: string
  advisoryCount: number
}

// the lockfile to scan and the directory holding the database archive
export interface RunOracleOptions {
  lockfilePath: string
  databaseDirectory: string
}

// the packages osv-scanner saw and one match per vulnerability group, each listed once across every result
export interface OracleOutput {
  packages: OraclePackage[]
  matches: OracleMatch[]
}

// one range event in the OSV spelling, with last_affected instead of lastAffected
export interface OsvRangeEvent {
  introduced?: string
  fixed?: string
  last_affected?: string
}

// one affected range as OSV writes it
export interface OsvRange {
  type: AdvisoryRangeType
  events: OsvRangeEvent[]
}

// one affected package as OSV writes it
export interface OsvAffected {
  package: { ecosystem: string; name: string }
  ranges: OsvRange[]
  versions: string[]
}

// the OSV entry fields osv-scanner matches on
export interface OsvEntry {
  id: string
  aliases: string[]
  summary: string
  details: string
  published: string
  modified: string
  withdrawn?: string
  affected: OsvAffected[]
}

// one vulnerability group of a scanned package. aliases is absent on some scanner versions
const oracleVulnerabilityGroupSchema = z.looseObject({
  ids: z.array(z.string()),
  aliases: z.array(z.string()).optional(),
})

// one scanned package. groups is absent on a package without vulnerabilities
const oracleScannedPackageSchema = z.looseObject({
  package: z.looseObject({ name: z.string(), version: z.string() }),
  groups: z.array(oracleVulnerabilityGroupSchema).optional(),
})

// one scanned source, such as a lockfile
const oracleSourceResultSchema = z.looseObject({
  packages: z.array(oracleScannedPackageSchema).optional(),
})

// the osv-scanner JSON output. every field not named here is kept but ignored
const oracleOutputSchema = z.looseObject({
  results: z.array(oracleSourceResultSchema),
})

// one scanned package as the schema reads it
type OracleScannedPackage = z.infer<typeof oracleScannedPackageSchema>

// the resolved binary to run and the scan to run it over
interface SpawnOracleOptions extends RunOracleOptions {
  oracleBinaryPath: string
}

// what one scan process produced, or why it could not start
type SpawnOracleResult =
  | {
      status: 'spawned'
      exitCode: number
      stdoutText: string
      stderrText: string
    }
  | { status: 'failed'; reason: string }

// the stderr text to search and the start of the line to find
interface FindStderrLineOptions {
  stderrText: string
  lineStart: string
}

// the items to sort and the key each one sorts by
interface SortByKeyOptions<Item> {
  items: Item[]
  toKey: (item: Item) => string
}

/**
 * Reports whether the osv-scanner binary is on the PATH the process holds right now.
 */
export function isOracleAvailable(): boolean {
  return findOracleBinaryPath() !== null
}

/**
 * Builds the osv-scanner argument list for an offline JSON scan of one lockfile against a local database.
 */
export function buildOracleArguments({
  lockfilePath,
  databaseDirectory,
}: RunOracleOptions): string[] {
  return [
    'scan',
    'source',
    '--offline',
    '--local-db-path',
    databaseDirectory,
    '--format',
    'json',
    '--all-packages',
    '--lockfile',
    lockfilePath,
  ]
}

/**
 * Writes every advisory as an OSV entry into the archive osv-scanner reads offline, one entry per distinct id.
 */
export async function writeOracleDatabase({
  advisories,
  databaseDirectory,
}: WriteOracleDatabaseOptions): Promise<WriteOracleDatabaseResult> {
  // keep the first advisory of every id
  const osvEntriesById = new Map<string, OsvEntry>()
  for (const advisory of advisories) {
    if (osvEntriesById.has(advisory.id)) {
      continue
    }
    osvEntriesById.set(advisory.id, toOsvEntry(advisory))
  }

  // encode one archive entry per advisory, named by its id
  const textEncoder = new TextEncoder()
  const archiveFiles: Record<string, Uint8Array> = {}
  for (const [advisoryId, osvEntry] of osvEntriesById) {
    archiveFiles[`${advisoryId}.json`] = textEncoder.encode(
      JSON.stringify(osvEntry),
    )
  }

  // write the archive where osv-scanner looks for the npm database
  const archivePath = join(databaseDirectory, oracleDatabaseArchivePath)
  await mkdir(dirname(archivePath), { recursive: true })
  await Bun.write(archivePath, zipSync(archiveFiles))
  return { archivePath, advisoryCount: osvEntriesById.size }
}

/**
 * Maps an Advisory back to the OSV entry shape, restoring the last_affected spelling and leaving withdrawn out when unset.
 */
export function toOsvEntry(advisory: Advisory): OsvEntry {
  return {
    id: advisory.id,
    aliases: advisory.aliases,
    summary: advisory.summary,
    details: advisory.details,
    published: advisory.published,
    modified: advisory.modified,
    ...(advisory.withdrawn === undefined
      ? {}
      : { withdrawn: advisory.withdrawn }),
    affected: advisory.affected.map(toOsvAffected),
  }
}

// osv-scanner 2.7.0 reports a database it cannot load and a lockfile without packages on stderr. its
// exit code is 0 or 1 with the JSON on stdout, and 127 or 128 after those two failures
/**
 * Runs osv-scanner offline over one lockfile and decides the result from its output, or reports why it could not run.
 */
export async function runOracle({
  lockfilePath,
  databaseDirectory,
}: RunOracleOptions): Promise<OracleResult> {
  // give up without the binary
  const oracleBinaryPath = findOracleBinaryPath()
  if (oracleBinaryPath === null) {
    return {
      status: 'unavailable',
      reason: `${oracleBinaryName} is not on PATH`,
    }
  }

  // run the scan to completion
  const spawnOracleResult = await spawnOracle({
    oracleBinaryPath,
    lockfilePath,
    databaseDirectory,
  })
  if (spawnOracleResult.status === 'failed') {
    return { status: 'unavailable', reason: spawnOracleResult.reason }
  }
  const { exitCode, stdoutText, stderrText } = spawnOracleResult

  // report a database the scanner could not load, whatever stdout holds
  const databaseLoadFailureLine = findStderrLine({
    stderrText,
    lineStart: databaseLoadFailureText,
  })
  if (databaseLoadFailureLine !== undefined) {
    return {
      status: 'unavailable',
      reason: `${oracleBinaryName} could not load the database under ${databaseDirectory}: ${databaseLoadFailureLine}`,
    }
  }

  // report a lockfile that resolves no packages as a scan that saw nothing
  const noPackageSourcesLine = findStderrLine({
    stderrText,
    lineStart: noPackageSourcesText,
  })
  if (noPackageSourcesLine !== undefined) {
    return { status: 'ran', packages: [], matches: [] }
  }

  // parse the JSON output into match keys, whatever the exit code
  const oracleOutput = tryParseOracleOutput(stdoutText)
  if (oracleOutput !== undefined) {
    return { status: 'ran', ...oracleOutput }
  }

  // report a scan without the JSON output as a crash, with what the scanner said
  return {
    status: 'unavailable',
    reason: `${oracleBinaryName} exited with ${exitCode} without its JSON output: ${stderrText.trim()}`,
  }
}

/**
 * Parses osv-scanner JSON output into the packages it saw and one match per vulnerability group, both sorted.
 */
export function parseOracleOutput(outputJson: unknown): OracleOutput {
  // check the shape and fail with the fields that do not fit
  const outputParseResult = oracleOutputSchema.safeParse(outputJson)
  if (!outputParseResult.success) {
    throw new Error(
      `${oracleBinaryName} output does not fit the expected shape: ${z.prettifyError(outputParseResult.error)}`,
    )
  }

  // flatten the scanned packages of every source
  const scannedPackages = outputParseResult.data.results.flatMap(
    (sourceResult) => sourceResult.packages ?? [],
  )

  // keep every package and every match once, keyed by its sort key
  const packagesByKey = new Map<string, OraclePackage>()
  const matchesByKey = new Map<string, OracleMatch>()
  for (const scannedPackage of scannedPackages) {
    const oraclePackage: OraclePackage = {
      packageName: scannedPackage.package.name,
      version: scannedPackage.package.version,
    }
    packagesByKey.set(toPackageSortKey(oraclePackage), oraclePackage)
    for (const packageMatch of listPackageMatches(scannedPackage)) {
      matchesByKey.set(toMatchSortKey(packageMatch), packageMatch)
    }
  }

  // order both lists by their keys
  const packages = sortByKey({
    items: [...packagesByKey.values()],
    toKey: toPackageSortKey,
  })
  const matches = sortByKey({
    items: [...matchesByKey.values()],
    toKey: toMatchSortKey,
  })
  return { packages, matches }
}

// map one affected package to the OSV spelling
function toOsvAffected(affectedPackage: AffectedPackage): OsvAffected {
  return {
    package: {
      ecosystem: affectedPackage.ecosystem,
      name: affectedPackage.name,
    },
    ranges: affectedPackage.ranges.map((advisoryRange) => ({
      type: advisoryRange.type,
      events: advisoryRange.events.map(toOsvRangeEvent),
    })),
    versions: affectedPackage.versions,
  }
}

// copy the event keys that are present, with lastAffected under its OSV name
function toOsvRangeEvent(
  advisoryRangeEvent: AdvisoryRangeEvent,
): OsvRangeEvent {
  return {
    ...(advisoryRangeEvent.introduced === undefined
      ? {}
      : { introduced: advisoryRangeEvent.introduced }),
    ...(advisoryRangeEvent.fixed === undefined
      ? {}
      : { fixed: advisoryRangeEvent.fixed }),
    ...(advisoryRangeEvent.lastAffected === undefined
      ? {}
      : { last_affected: advisoryRangeEvent.lastAffected }),
  }
}

// look the binary up on the live PATH. Bun.which and Bun.spawn alone search the PATH captured at startup
function findOracleBinaryPath(): string | null {
  return Bun.which(oracleBinaryName, { PATH: process.env.PATH })
}

// start the scan with both streams piped and wait for it to exit
async function spawnOracle({
  oracleBinaryPath,
  lockfilePath,
  databaseDirectory,
}: SpawnOracleOptions): Promise<SpawnOracleResult> {
  const oracleCommand = [
    oracleBinaryPath,
    ...buildOracleArguments({ lockfilePath, databaseDirectory }),
  ]
  try {
    // read both streams to the end alongside the exit
    const oracleProcess = Bun.spawn(oracleCommand, {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      new Response(oracleProcess.stdout).text(),
      new Response(oracleProcess.stderr).text(),
      oracleProcess.exited,
    ])
    return { status: 'spawned', exitCode, stdoutText, stderrText }
  } catch (spawnError) {
    return {
      status: 'failed',
      reason: `${oracleBinaryName} could not start: ${describeError(spawnError)}`,
    }
  }
}

// find the first stderr line that starts with the given text once trimmed
function findStderrLine({
  stderrText,
  lineStart,
}: FindStderrLineOptions): string | undefined {
  const stderrLines = stderrText
    .split('\n')
    .map((stderrLine) => stderrLine.trim())
  return stderrLines.find((stderrLine) => stderrLine.startsWith(lineStart))
}

// read the scan output as the output shape, or nothing when it is not JSON or does not fit
function tryParseOracleOutput(stdoutText: string): OracleOutput | undefined {
  try {
    return parseOracleOutput(JSON.parse(stdoutText))
  } catch {
    return undefined
  }
}

/** Returns the message of a thrown value, whatever its type. */
export function describeError(thrownValue: unknown): string {
  if (thrownValue instanceof Error) {
    return thrownValue.message
  }
  return String(thrownValue)
}

// one match per vulnerability group of a scanned package, with the group's ids and aliases merged. a group whose ids
// and aliases are both empty is dropped
function listPackageMatches(
  scannedPackage: OracleScannedPackage,
): OracleMatch[] {
  const packageName = scannedPackage.package.name
  const version = scannedPackage.package.version
  const packageMatches: OracleMatch[] = []
  for (const vulnerabilityGroup of scannedPackage.groups ?? []) {
    const advisoryIds = sortUniqueAdvisoryIds([
      ...vulnerabilityGroup.ids,
      ...(vulnerabilityGroup.aliases ?? []),
    ])
    if (advisoryIds.length === 0) {
      continue
    }
    packageMatches.push({ packageName, version, advisoryIds })
  }
  return packageMatches
}

// the distinct advisory ids in code unit order
function sortUniqueAdvisoryIds(advisoryIds: string[]): string[] {
  const uniqueAdvisoryIds = [...new Set(advisoryIds)]
  return uniqueAdvisoryIds.sort((first, second) =>
    compareCodeUnitOrder({ first, second }),
  )
}

// the sort key of a scanned package: name then version
function toPackageSortKey(oraclePackage: OraclePackage): string {
  return `${oraclePackage.packageName}\n${oraclePackage.version}`
}

// the sort key of a match: name, version, then the joined ids
function toMatchSortKey(oracleMatch: OracleMatch): string {
  return `${toPackageSortKey(oracleMatch)}\n${oracleMatch.advisoryIds.join(',')}`
}

// sort the items in place by their keys in code unit order
function sortByKey<Item>({ items, toKey }: SortByKeyOptions<Item>): Item[] {
  return items.sort((first, second) =>
    compareCodeUnitOrder({ first: toKey(first), second: toKey(second) }),
  )
}
