// the benchmark:validate entry: validates the checked-in corpus, prints the counts by category and split and exits non-zero on any problem
import { benchmarkCategories } from '@/shared/benchmark'
import {
  type CorpusValidation,
  type ValidateBenchmarkCorpusOptions,
  validateBenchmarkCorpus,
} from './corpus-validation'

/**
 * Validates the corpus, prints the counts and the problems, and returns the exit status. Every directory defaults to the checked-in one.
 */
export async function runValidateCommand(
  options: ValidateBenchmarkCorpusOptions = {},
): Promise<number> {
  // validate the corpus and its fixtures
  const corpusValidation = await validateBenchmarkCorpus(options)

  // print the counts, then every problem on stderr as caseId: message
  printCounts(corpusValidation)
  for (const problem of corpusValidation.problems) {
    console.error(`${problem.caseId}: ${problem.message}`)
  }

  return corpusValidation.problems.length > 0 ? 1 : 0
}

// print one line per category with its split counts, then the total
function printCounts({
  countsByCategory,
  countsBySplit,
}: CorpusValidation): void {
  // one line per category
  let totalCount = 0
  for (const category of benchmarkCategories) {
    const categoryCount = countsByCategory[category]
    const { dev, test } = countsBySplit[category]
    console.log(`${category}: ${categoryCount} (dev ${dev}, test ${test})`)
    totalCount += categoryCount
  }

  console.log(`total: ${totalCount}`)
}

// run the command only when this file is the entry point, not when a test imports it
if (import.meta.main) {
  process.exit(await runValidateCommand())
}
