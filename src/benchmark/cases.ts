// loads the benchmark cases from disk: the corpus and fixture directories, one case per directory, sorted by id
import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  type BenchmarkCase,
  type BenchmarkSplit,
  benchmarkCaseSchema,
} from '@/shared/benchmark'
import { describeError, describeZodError } from './error-messages'

// the corpus and fixture directories, resolved from the repository root
export const benchmarkCasesDirectory = join(
  resolveRepositoryRoot(),
  'benchmark',
  'cases',
)
export const benchmarkAdvisoryFixtureDirectory = join(
  resolveRepositoryRoot(),
  'benchmark',
  'fixtures',
  'advisories',
)
export const benchmarkFixtureAppDirectory = join(
  resolveRepositoryRoot(),
  'benchmark',
  'fixtures',
  'app',
)

// a case read from disk with the directory that holds it
export interface LoadedBenchmarkCase {
  benchmarkCase: BenchmarkCase
  caseDirectory: string
}

// which directory to load from and which split to keep. no split keeps every case
export interface LoadBenchmarkCasesOptions {
  casesDirectory?: string
  split?: BenchmarkSplit
}

// the outcome of reading one case directory
export type CaseRead =
  | { kind: 'loaded'; loadedCase: LoadedBenchmarkCase }
  | { kind: 'failed'; directoryName: string; message: string }

/**
 * Returns the repository root, the closest directory above this file that holds a package.json.
 */
export function resolveRepositoryRoot(): string {
  // walk up until a package.json appears or the filesystem root is reached
  let directory = import.meta.dir
  while (!existsSync(join(directory, 'package.json'))) {
    const parentDirectory = dirname(directory)
    if (parentDirectory === directory) {
      throw new Error(`no package.json found above ${import.meta.dir}`)
    }
    directory = parentDirectory
  }
  return directory
}

/**
 * Loads every case under the cases directory, sorted by id and filtered to one split when asked.
 */
export async function loadBenchmarkCases({
  casesDirectory = benchmarkCasesDirectory,
  split,
}: LoadBenchmarkCasesOptions = {}): Promise<LoadedBenchmarkCase[]> {
  // read every case directory and stop at the first one that does not load
  const caseReads = await readCaseDirectories(casesDirectory)
  const loadedCases: LoadedBenchmarkCase[] = []
  for (const caseRead of caseReads) {
    if (caseRead.kind === 'failed') {
      throw new Error(`${caseRead.directoryName}: ${caseRead.message}`)
    }
    loadedCases.push(caseRead.loadedCase)
  }

  // keep only the requested split
  const splitCases =
    split === undefined
      ? loadedCases
      : loadedCases.filter(
          (loadedCase) => loadedCase.benchmarkCase.split === split,
        )

  // order by id
  splitCases.sort((left, right) =>
    left.benchmarkCase.id.localeCompare(right.benchmarkCase.id),
  )
  return splitCases
}

/**
 * Reads every directory under the cases directory as a case, in name order. A missing cases directory holds no cases.
 */
export async function readCaseDirectories(
  casesDirectory: string,
): Promise<CaseRead[]> {
  if (!isDirectory(casesDirectory)) {
    return []
  }

  // list the case directories in name order
  const entries = await readdir(casesDirectory, { withFileTypes: true })
  const directoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  directoryNames.sort()

  // read each one
  const caseReads: CaseRead[] = []
  for (const directoryName of directoryNames) {
    const caseRead = await readCaseDirectory(
      join(casesDirectory, directoryName),
    )
    caseReads.push(caseRead)
  }
  return caseReads
}

// read and parse one case directory's case.json
async function readCaseDirectory(caseDirectory: string): Promise<CaseRead> {
  // read the json, reporting a missing or malformed file
  const directoryName = basename(caseDirectory)
  const caseFilePath = join(caseDirectory, 'case.json')
  let caseJson: unknown
  try {
    caseJson = await Bun.file(caseFilePath).json()
  } catch (error) {
    return {
      kind: 'failed',
      directoryName,
      message: `case.json cannot be read: ${describeError(error)}`,
    }
  }

  // parse it against the shared contract
  const parseResult = benchmarkCaseSchema.safeParse(caseJson)
  if (!parseResult.success) {
    return {
      kind: 'failed',
      directoryName,
      message: `case.json does not match the benchmark case contract: ${describeZodError(parseResult.error)}`,
    }
  }
  return {
    kind: 'loaded',
    loadedCase: { benchmarkCase: parseResult.data, caseDirectory },
  }
}

/**
 * Tells whether a path names an existing directory.
 */
export function isDirectory(path: string): boolean {
  if (!existsSync(path)) {
    return false
  }
  return statSync(path).isDirectory()
}
