// validates the benchmark corpus against every check in the corpus spec: the layout and labels of each case, the counts by category and split, and the fixtures the cases derive from
import { basename, join } from 'node:path'
import { SnapshotPullRequestSource } from '@/pull-request-source/snapshot-pull-request-source'
import type { Advisory } from '@/shared/advisory'
import {
  type BenchmarkCase,
  type BenchmarkCategory,
  type BenchmarkSplit,
  benchmarkCategories,
  type ExpectedFinding,
} from '@/shared/benchmark'
import type { ChangedFile } from '@/shared/pull-request-source'
import {
  benchmarkAdvisoryFixtureDirectory,
  benchmarkCasesDirectory,
  benchmarkFixtureAppDirectory,
  isDirectory,
  type LoadedBenchmarkCase,
  readCaseDirectories,
} from './cases'
import { checkFixtureApp, readAdvisoryFixture } from './fixtures'

// how many cases each category holds when the corpus is complete
const expectedCountsByCategory: Record<BenchmarkCategory, number> = {
  sca: 12,
  code: 15,
  secrets: 4,
  clean: 15,
  'real-world': 8,
}

// which directories to validate. each defaults to the checked-in one
export interface ValidateBenchmarkCorpusOptions {
  casesDirectory?: string
  advisoryFixtureDirectory?: string
  fixtureAppDirectory?: string
}

// one failed check. caseId is the case, or the corpus or fixture name for a check across cases
export interface CorpusProblem {
  caseId: string
  message: string
}

// the problems found and the counts by category and by split within each category
export interface CorpusValidation {
  problems: CorpusProblem[]
  countsByCategory: Record<BenchmarkCategory, number>
  countsBySplit: Record<BenchmarkCategory, Record<BenchmarkSplit, number>>
}

// every case that read cleanly, and a problem for every case that did not
interface CorpusRead {
  loadedCases: LoadedBenchmarkCase[]
  problems: CorpusProblem[]
}

/**
 * Validates the corpus and its fixtures against every check in the corpus spec.
 */
export async function validateBenchmarkCorpus({
  casesDirectory = benchmarkCasesDirectory,
  advisoryFixtureDirectory = benchmarkAdvisoryFixtureDirectory,
  fixtureAppDirectory = benchmarkFixtureAppDirectory,
}: ValidateBenchmarkCorpusOptions = {}): Promise<CorpusValidation> {
  // read every case, keeping the ones that fail to read as problems
  const corpusRead = await readCorpus(casesDirectory)
  const { loadedCases } = corpusRead
  const problems = [...corpusRead.problems]

  // read the advisory fixture once for the label and coverage checks
  const advisoryFixtureRead = await readAdvisoryFixture(
    advisoryFixtureDirectory,
  )
  const { advisories, knownCleanPackages } = advisoryFixtureRead
  problems.push(
    ...advisoryFixtureRead.problems.map((message) => ({
      caseId: 'advisory-fixture',
      message,
    })),
  )

  // check every case on its own
  for (const loadedCase of loadedCases) {
    const caseProblems = await checkCase({ loadedCase, advisories })
    problems.push(...caseProblems)
  }

  // check the corpus as a whole and the fixture app it derives from
  problems.push(...checkCategoryCounts(loadedCases))
  problems.push(...checkSplitCoverage(loadedCases))
  const fixtureAppMessages = await checkFixtureApp({
    fixtureAppDirectory,
    advisories,
    knownCleanPackages,
  })
  problems.push(
    ...fixtureAppMessages.map((message) => ({
      caseId: 'fixture-app',
      message,
    })),
  )

  return {
    problems,
    countsByCategory: countByCategory(loadedCases),
    countsBySplit: countBySplit(loadedCases),
  }
}

// read every case for validation, turning each failed read into a problem named by its directory
async function readCorpus(casesDirectory: string): Promise<CorpusRead> {
  // sort every read into a loaded case or a problem
  const caseReads = await readCaseDirectories(casesDirectory)
  const corpusRead: CorpusRead = { loadedCases: [], problems: [] }
  for (const caseRead of caseReads) {
    if (caseRead.kind === 'failed') {
      corpusRead.problems.push({
        caseId: caseRead.directoryName,
        message: caseRead.message,
      })
      continue
    }
    corpusRead.loadedCases.push(caseRead.loadedCase)
  }
  return corpusRead
}

// the inputs of the per-case checks
interface CheckCaseOptions {
  loadedCase: LoadedBenchmarkCase
  advisories: Advisory[]
}

// run every per-case check and return its problems
async function checkCase({
  loadedCase,
  advisories,
}: CheckCaseOptions): Promise<CorpusProblem[]> {
  // check the directory layout for the source kind
  const { benchmarkCase } = loadedCase
  const messages: string[] = []
  messages.push(...checkIdMatchesDirectory(loadedCase))
  const layoutMessages =
    benchmarkCase.source.kind === 'snapshot'
      ? checkSnapshotLayout(loadedCase)
      : checkGitLayout(loadedCase)
  messages.push(...layoutMessages)

  // check the labels
  messages.push(...checkCleanConsistency(benchmarkCase))
  messages.push(...checkRealWorldSource(benchmarkCase))
  messages.push(...checkExpectedLabels(benchmarkCase))
  messages.push(...checkLabelAdvisories({ benchmarkCase, advisories }))

  // diff a snapshot case whose trees are in place and check the labels against it
  if (benchmarkCase.source.kind === 'snapshot' && layoutMessages.length === 0) {
    const diffMessages = await checkSnapshotDiff(loadedCase)
    messages.push(...diffMessages)
  }

  return messages.map((message) => ({ caseId: benchmarkCase.id, message }))
}

// the id in case.json must equal the directory name
function checkIdMatchesDirectory({
  benchmarkCase,
  caseDirectory,
}: LoadedBenchmarkCase): string[] {
  // compare the id with the last path segment
  const directoryName = basename(caseDirectory)
  if (benchmarkCase.id === directoryName) {
    return []
  }
  return [
    `id "${benchmarkCase.id}" does not match the directory name "${directoryName}"`,
  ]
}

// a snapshot case holds base/ and head/ and names its own directory as the source
function checkSnapshotLayout({
  benchmarkCase,
  caseDirectory,
}: LoadedBenchmarkCase): string[] {
  // the source dir points at the case directory under the repository
  const messages: string[] = []
  const expectedSourceDirectory = `benchmark/cases/${benchmarkCase.id}`
  if (
    benchmarkCase.source.kind === 'snapshot' &&
    benchmarkCase.source.dir !== expectedSourceDirectory
  ) {
    messages.push(
      `snapshot source dir is "${benchmarkCase.source.dir}" but should be "${expectedSourceDirectory}"`,
    )
  }

  // both trees exist
  if (!isDirectory(join(caseDirectory, 'base'))) {
    messages.push('snapshot case has no base/ directory')
  }
  if (!isDirectory(join(caseDirectory, 'head'))) {
    messages.push('snapshot case has no head/ directory')
  }
  return messages
}

// a git case holds no snapshot trees
function checkGitLayout({ caseDirectory }: LoadedBenchmarkCase): string[] {
  // name each snapshot tree that is present
  const messages: string[] = []
  if (isDirectory(join(caseDirectory, 'base'))) {
    messages.push('git case must not hold a base/ directory')
  }
  if (isDirectory(join(caseDirectory, 'head'))) {
    messages.push('git case must not hold a head/ directory')
  }
  return messages
}

// a real-world case reads its advisory's fix from a git source
function checkRealWorldSource(benchmarkCase: BenchmarkCase): string[] {
  if (
    benchmarkCase.category === 'real-world' &&
    benchmarkCase.source.kind !== 'git'
  ) {
    return ['real-world case must have a git source']
  }
  return []
}

// isClean and an empty expected list imply each other
function checkCleanConsistency(benchmarkCase: BenchmarkCase): string[] {
  // name whichever side of the implication fails
  const hasExpectedFindings = benchmarkCase.expected.length > 0
  if (benchmarkCase.isClean && hasExpectedFindings) {
    return ['isClean is true but the expected findings are not empty']
  }
  if (!benchmarkCase.isClean && !hasExpectedFindings) {
    return ['the expected findings are empty but isClean is false']
  }
  return []
}

// the expected findings name the detector of the case's category and carry the fields its matching rule needs
function checkExpectedLabels(benchmarkCase: BenchmarkCase): string[] {
  switch (benchmarkCase.category) {
    case 'sca':
      return checkDetectorLabels({
        benchmarkCase,
        detector: 'sca',
        fieldNames: ['packageName', 'advisoryId'],
      })
    case 'secrets':
      return checkDetectorLabels({
        benchmarkCase,
        detector: 'secrets',
        fieldNames: ['file', 'startLine'],
      })
    case 'code':
      return checkSingleCodeReviewLabel({
        benchmarkCase,
        fieldNames: ['cwe', 'file', 'startLine', 'endLine'],
      })
    case 'real-world':
      return checkSingleCodeReviewLabel({
        benchmarkCase,
        fieldNames: ['advisoryId', 'cwe', 'file', 'startLine', 'endLine'],
      })
    case 'clean':
      return []
  }
}

// the inputs of the per-detector label check
interface CheckDetectorLabelsOptions {
  benchmarkCase: BenchmarkCase
  detector: ExpectedFinding['detector']
  fieldNames: (keyof ExpectedFinding)[]
}

// every expected finding of the case names the detector and sets the named fields
function checkDetectorLabels({
  benchmarkCase,
  detector,
  fieldNames,
}: CheckDetectorLabelsOptions): string[] {
  return benchmarkCase.expected.flatMap((expectedFinding, index) => {
    if (expectedFinding.detector !== detector) {
      return [
        `${benchmarkCase.category} case expects a ${expectedFinding.detector} finding but must expect ${detector}`,
      ]
    }
    return findMissingFields({ expectedFinding, index, fieldNames })
  })
}

// the inputs of the single code-review label check
interface CheckSingleCodeReviewLabelOptions {
  benchmarkCase: BenchmarkCase
  fieldNames: (keyof ExpectedFinding)[]
}

// a code or real-world case expects exactly one code-review finding with the named fields
function checkSingleCodeReviewLabel({
  benchmarkCase,
  fieldNames,
}: CheckSingleCodeReviewLabelOptions): string[] {
  // exactly one finding, from the code-review detector
  const [expectedFinding] = benchmarkCase.expected
  if (benchmarkCase.expected.length !== 1 || expectedFinding === undefined) {
    return [
      `${benchmarkCase.category} case must expect exactly one finding but expects ${benchmarkCase.expected.length}`,
    ]
  }
  if (expectedFinding.detector !== 'code-review') {
    return [
      `${benchmarkCase.category} case must expect a code-review finding but expects ${expectedFinding.detector}`,
    ]
  }

  return findMissingFields({ expectedFinding, index: 0, fieldNames })
}

// the inputs of the missing-field check
interface FindMissingFieldsOptions {
  expectedFinding: ExpectedFinding
  index: number
  fieldNames: (keyof ExpectedFinding)[]
}

// name each required field the expected finding leaves unset
function findMissingFields({
  expectedFinding,
  index,
  fieldNames,
}: FindMissingFieldsOptions): string[] {
  // keep the fields that are unset and name each one
  const missingFieldNames = fieldNames.filter(
    (fieldName) => expectedFinding[fieldName] === undefined,
  )
  return missingFieldNames.map(
    (fieldName) => `expected finding ${index} has no ${fieldName}`,
  )
}

// the inputs of the label advisory check
interface CheckLabelAdvisoriesOptions {
  benchmarkCase: BenchmarkCase
  advisories: Advisory[]
}

// every advisory id a label names is the id or an alias of a fixture advisory, and a git case's advisory names the base sha in a reference
function checkLabelAdvisories({
  benchmarkCase,
  advisories,
}: CheckLabelAdvisoriesOptions): string[] {
  // look each labeled advisory id up verbatim, as the id or an alias
  const messages: string[] = []
  for (const expectedFinding of benchmarkCase.expected) {
    const { advisoryId } = expectedFinding
    if (advisoryId === undefined) {
      continue
    }
    const advisory = advisories.find(
      (candidate) =>
        candidate.id === advisoryId || candidate.aliases.includes(advisoryId),
    )
    if (advisory === undefined) {
      messages.push(`advisory ${advisoryId} is not in the advisory fixture`)
      continue
    }

    // a git case's advisory has a reference naming the fix commit the case uses as base
    if (benchmarkCase.source.kind !== 'git') {
      continue
    }
    const { baseSha } = benchmarkCase.source
    const hasFixReference = advisory.references.some((reference) =>
      reference.url.includes(baseSha),
    )
    if (!hasFixReference) {
      messages.push(
        `advisory ${advisoryId} has no reference whose url names the base sha ${baseSha}`,
      )
    }
  }
  return messages
}

// the head differs from the base outside node_modules, and every label with a file and a start line sits on lines the head adds
async function checkSnapshotDiff({
  benchmarkCase,
  caseDirectory,
}: LoadedBenchmarkCase): Promise<string[]> {
  // diff the two trees the way the runner does, leaving out anything under node_modules
  const snapshotSource = new SnapshotPullRequestSource({
    baseDir: join(caseDirectory, 'base'),
    headDir: join(caseDirectory, 'head'),
  })
  const allChangedFiles = await snapshotSource.listChangedFiles()
  const changedFiles = allChangedFiles.filter(
    (changedFile) => !changedFile.path.split('/').includes('node_modules'),
  )

  // at least one file differs
  if (changedFiles.length === 0) {
    return ['base/ and head/ hold the same files with the same contents']
  }

  // check each label that names lines
  return benchmarkCase.expected.flatMap((expectedFinding, index) =>
    findLabelLinesOutsideAddedLines({ expectedFinding, index, changedFiles }),
  )
}

// the inputs of the added-lines check of one label
interface FindLabelLinesOutsideAddedLinesOptions {
  expectedFinding: ExpectedFinding
  index: number
  changedFiles: ChangedFile[]
}

// name the labeled file the head does not change, or the first labeled line the head does not add
function findLabelLinesOutsideAddedLines({
  expectedFinding,
  index,
  changedFiles,
}: FindLabelLinesOutsideAddedLinesOptions): string[] {
  // a label without a file or a start line names no lines to check
  const { file, startLine } = expectedFinding
  if (file === undefined || startLine === undefined) {
    return []
  }

  // the labeled file is one the head changes
  const changedFile = changedFiles.find((candidate) => candidate.path === file)
  if (changedFile === undefined) {
    return [
      `expected finding ${index} labels ${file} but the head does not change that file`,
    ]
  }

  // every labeled line is one the head adds
  const endLine = expectedFinding.endLine ?? startLine
  const addedLineNumbers = new Set(
    changedFile.addedLines.map((addedLine) => addedLine.line),
  )
  for (let line = startLine; line <= endLine; line += 1) {
    if (!addedLineNumbers.has(line)) {
      return [
        `expected finding ${index} labels ${file} lines ${startLine}-${endLine} but the head does not add line ${line}`,
      ]
    }
  }
  return []
}

// a non-empty corpus holds the expected number of cases in every category
function checkCategoryCounts(
  loadedCases: LoadedBenchmarkCase[],
): CorpusProblem[] {
  if (loadedCases.length === 0) {
    return []
  }

  // report every category whose count is off
  const countsByCategory = countByCategory(loadedCases)
  const problems: CorpusProblem[] = []
  for (const category of benchmarkCategories) {
    const expectedCount = expectedCountsByCategory[category]
    const actualCount = countsByCategory[category]
    if (actualCount === expectedCount) {
      continue
    }
    problems.push({
      caseId: 'corpus',
      message: `expected ${expectedCount} ${category} cases but found ${actualCount}`,
    })
  }
  return problems
}

// every category of a non-empty corpus has at least one dev and one test case
function checkSplitCoverage(
  loadedCases: LoadedBenchmarkCase[],
): CorpusProblem[] {
  if (loadedCases.length === 0) {
    return []
  }

  // report every category missing a split
  const countsBySplit = countBySplit(loadedCases)
  const problems: CorpusProblem[] = []
  for (const category of benchmarkCategories) {
    if (countsBySplit[category].dev === 0) {
      problems.push({
        caseId: 'corpus',
        message: `category ${category} has no dev case`,
      })
    }
    if (countsBySplit[category].test === 0) {
      problems.push({
        caseId: 'corpus',
        message: `category ${category} has no test case`,
      })
    }
  }
  return problems
}

// count the cases in each category
function countByCategory(
  loadedCases: LoadedBenchmarkCase[],
): Record<BenchmarkCategory, number> {
  // start every category at zero and add each case
  const countsByCategory: Record<BenchmarkCategory, number> = {
    sca: 0,
    code: 0,
    secrets: 0,
    clean: 0,
    'real-world': 0,
  }
  for (const { benchmarkCase } of loadedCases) {
    countsByCategory[benchmarkCase.category] += 1
  }
  return countsByCategory
}

// count the dev and test cases in each category
function countBySplit(
  loadedCases: LoadedBenchmarkCase[],
): Record<BenchmarkCategory, Record<BenchmarkSplit, number>> {
  // start every category at zero in both splits and add each case
  const countsBySplit: Record<
    BenchmarkCategory,
    Record<BenchmarkSplit, number>
  > = {
    sca: { dev: 0, test: 0 },
    code: { dev: 0, test: 0 },
    secrets: { dev: 0, test: 0 },
    clean: { dev: 0, test: 0 },
    'real-world': { dev: 0, test: 0 },
  }
  for (const { benchmarkCase } of loadedCases) {
    countsBySplit[benchmarkCase.category][benchmarkCase.split] += 1
  }
  return countsBySplit
}
