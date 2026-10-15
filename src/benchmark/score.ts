// the pure benchmark scorer: matches predicted findings to expected ones greedily and one-to-one and turns the matches into precision, recall and f1 overall, by detector and by category
import {
  type BenchmarkCase,
  type BenchmarkCaseResult,
  type BenchmarkCategory,
  type BenchmarkScore,
  type BenchmarkSplit,
  benchmarkScoreSchema,
  type ExpectedFinding,
  type ScoreTriple,
} from '@/shared/benchmark'
import type { DetectorKind, Finding } from '@/shared/finding'
import { matchesExpectedFinding } from './match-rules'

// how a case ended: the pipeline returned, threw, or the case could not run at all
export const benchmarkCaseStatuses = ['completed', 'failed', 'skipped'] as const
export type BenchmarkCaseStatus = (typeof benchmarkCaseStatuses)[number]

// what the runner hands the scorer for one case
export interface BenchmarkCaseOutcome {
  benchmarkCase: BenchmarkCase
  findings: Finding[]
  costUsd: number
  durationMs: number
  status: BenchmarkCaseStatus
  errorMessage?: string
}

// an expected finding and the predicted finding that matched it
export interface MatchedFindingPair {
  expectedFinding: ExpectedFinding
  predictedFinding: Finding
}

// everything the scorer decided about one case
export interface BenchmarkCaseDetail {
  caseId: string
  category: BenchmarkCategory
  split: BenchmarkSplit
  status: BenchmarkCaseStatus
  errorMessage?: string
  truePositives: number
  falsePositives: number
  falseNegatives: number
  matchedPairs: MatchedFindingPair[]
  unmatchedPredictions: Finding[]
  missedExpectations: ExpectedFinding[]
  preExistingFindings: Finding[]
  costUsd: number
  durationMs: number
}

// the shared score plus the per-case detail a results file records
export interface BenchmarkRunScore extends BenchmarkScore {
  caseDetails: BenchmarkCaseDetail[]
}

// the input of scoreBenchmark: one outcome per case of the run
export interface ScoreBenchmarkOptions {
  caseOutcomes: BenchmarkCaseOutcome[]
}

// the three counts every metric is computed from
interface MatchCounts {
  truePositives: number
  falsePositives: number
  falseNegatives: number
}

// the counts of a case that scored nothing
const emptyMatchCounts: MatchCounts = {
  truePositives: 0,
  falsePositives: 0,
  falseNegatives: 0,
}

/**
 * Scores a benchmark run from the outcome of every case, with no file or network access.
 */
export function scoreBenchmark({
  caseOutcomes,
}: ScoreBenchmarkOptions): BenchmarkRunScore {
  // score each case on its own
  const caseDetails = caseOutcomes.map(scoreBenchmarkCase)

  // leave skipped cases out of every total and breakdown
  const countedCaseDetails = caseDetails.filter(
    (caseDetail) => caseDetail.status !== 'skipped',
  )

  // micro-average over the summed counts of the counted cases
  const overallCounts = sumMatchCounts(countedCaseDetails)
  const overallTriple = computeScoreTriple(overallCounts)

  // break the same triple down by detector and by category
  const countsByDetector = computeCountsByDetector(countedCaseDetails)
  const countsByCategory = computeCountsByCategory(countedCaseDetails)

  // count the false positives raised on clean cases
  const cleanCaseDetails = countedCaseDetails.filter(
    (caseDetail) => caseDetail.isClean,
  )
  const falsePositivesOnClean = sumMatchCounts(cleanCaseDetails).falsePositives

  // total cost and duration over the counted cases
  const totalCostUsd = countedCaseDetails.reduce(
    (total, caseDetail) => total + caseDetail.costUsd,
    0,
  )
  const totalDurationMs = countedCaseDetails.reduce(
    (total, caseDetail) => total + caseDetail.durationMs,
    0,
  )

  // validate the shared score so every number is in range, then attach the detail
  const benchmarkScore = benchmarkScoreSchema.parse({
    ...overallTriple,
    byDetector: toScoreTripleRecord(countsByDetector),
    byCategory: toScoreTripleRecord(countsByCategory),
    falsePositivesOnClean,
    totalCostUsd,
    totalDurationMs,
    caseResults: caseDetails.map(toBenchmarkCaseResult),
  })
  return {
    ...benchmarkScore,
    caseDetails: caseDetails.map(toBenchmarkCaseDetail),
  }
}

// a case detail together with the clean flag the breakdowns need
interface ScoredCase extends BenchmarkCaseDetail {
  isClean: boolean
}

// score one case: a skipped case counts nothing, a failed case misses everything it expected
function scoreBenchmarkCase(caseOutcome: BenchmarkCaseOutcome): ScoredCase {
  // set the findings the pull request did not introduce aside, whatever the status
  const { benchmarkCase, findings, status } = caseOutcome
  const scoredCase: ScoredCase = {
    ...makeEmptyScoredCase(caseOutcome),
    preExistingFindings: findings.filter(
      (finding) => !finding.isIntroducedByPullRequest,
    ),
  }

  // a skipped case counts nothing
  if (status === 'skipped') {
    return scoredCase
  }

  // a failed case misses every expected finding and scores no prediction
  if (status === 'failed') {
    return {
      ...scoredCase,
      falseNegatives: benchmarkCase.expected.length,
      missedExpectations: [...benchmarkCase.expected],
    }
  }

  // match the expected findings one-to-one against the introduced ones
  const { matchedPairs, unmatchedPredictions, missedExpectations } =
    matchFindings({
      expectedFindings: benchmarkCase.expected,
      predictedFindings: findings.filter(
        (finding) => finding.isIntroducedByPullRequest,
      ),
    })
  return {
    ...scoredCase,
    truePositives: matchedPairs.length,
    falsePositives: unmatchedPredictions.length,
    falseNegatives: missedExpectations.length,
    matchedPairs,
    unmatchedPredictions,
    missedExpectations,
  }
}

// the scored case of an outcome before anything is matched: zero counts and empty lists
function makeEmptyScoredCase({
  benchmarkCase,
  status,
  errorMessage,
  costUsd,
  durationMs,
}: BenchmarkCaseOutcome): ScoredCase {
  return {
    caseId: benchmarkCase.id,
    category: benchmarkCase.category,
    split: benchmarkCase.split,
    status,
    errorMessage,
    isClean: benchmarkCase.isClean,
    ...emptyMatchCounts,
    matchedPairs: [],
    unmatchedPredictions: [],
    missedExpectations: [],
    preExistingFindings: [],
    costUsd,
    durationMs,
  }
}

// the expected and predicted findings of one case
interface MatchFindingsOptions {
  expectedFindings: ExpectedFinding[]
  predictedFindings: Finding[]
}

// what greedy matching leaves on each side
interface MatchFindingsResult {
  matchedPairs: MatchedFindingPair[]
  unmatchedPredictions: Finding[]
  missedExpectations: ExpectedFinding[]
}

// match greedily and one-to-one: each expected finding, in label order, takes the first free prediction that satisfies its rule
function matchFindings({
  expectedFindings,
  predictedFindings,
}: MatchFindingsOptions): MatchFindingsResult {
  // start with every prediction free and nothing matched or missed
  const unmatchedPredictions = [...predictedFindings]
  const matchedPairs: MatchedFindingPair[] = []
  const missedExpectations: ExpectedFinding[] = []

  // take the first free prediction that matches, or record a miss
  for (const expectedFinding of expectedFindings) {
    const matchingPrediction = unmatchedPredictions.find((predictedFinding) =>
      matchesExpectedFinding({ expectedFinding, predictedFinding }),
    )
    if (matchingPrediction === undefined) {
      missedExpectations.push(expectedFinding)
      continue
    }
    unmatchedPredictions.splice(
      unmatchedPredictions.indexOf(matchingPrediction),
      1,
    )
    matchedPairs.push({ expectedFinding, predictedFinding: matchingPrediction })
  }

  return { matchedPairs, unmatchedPredictions, missedExpectations }
}

// add up the counts of a list of cases
function sumMatchCounts(caseDetails: BenchmarkCaseDetail[]): MatchCounts {
  return caseDetails.reduce<MatchCounts>(
    (total, caseDetail) =>
      addMatchCounts({ firstCounts: total, secondCounts: caseDetail }),
    emptyMatchCounts,
  )
}

// the two sets of counts an addition combines
interface AddMatchCountsOptions {
  firstCounts: MatchCounts
  secondCounts: MatchCounts
}

// add two sets of counts
function addMatchCounts({
  firstCounts,
  secondCounts,
}: AddMatchCountsOptions): MatchCounts {
  return {
    truePositives: firstCounts.truePositives + secondCounts.truePositives,
    falsePositives: firstCounts.falsePositives + secondCounts.falsePositives,
    falseNegatives: firstCounts.falseNegatives + secondCounts.falseNegatives,
  }
}

// compute precision, recall and f1 from counts. an undefined ratio is 0
function computeScoreTriple({
  truePositives,
  falsePositives,
  falseNegatives,
}: MatchCounts): ScoreTriple {
  // precision is the share of predictions that were right
  const predictionCount = truePositives + falsePositives
  const precision = predictionCount === 0 ? 0 : truePositives / predictionCount

  // recall is the share of expected findings that were found
  const expectationCount = truePositives + falseNegatives
  const recall = expectationCount === 0 ? 0 : truePositives / expectationCount

  // f1 is the harmonic mean of the two
  const precisionAndRecall = precision + recall
  const f1 =
    precisionAndRecall === 0 ? 0 : (2 * precision * recall) / precisionAndRecall
  return { precision, recall, f1 }
}

// key the counts by the detector of each expected finding and each scored prediction
function computeCountsByDetector(
  caseDetails: BenchmarkCaseDetail[],
): Map<DetectorKind, MatchCounts> {
  const countsByDetector = new Map<DetectorKind, MatchCounts>()

  // a matched pair is a true positive of its detector, a free prediction a false positive, a miss a false negative
  for (const caseDetail of caseDetails) {
    for (const matchedPair of caseDetail.matchedPairs) {
      addCountsToBreakdown({
        breakdown: countsByDetector,
        key: matchedPair.expectedFinding.detector,
        counts: { ...emptyMatchCounts, truePositives: 1 },
      })
    }
    for (const unmatchedPrediction of caseDetail.unmatchedPredictions) {
      addCountsToBreakdown({
        breakdown: countsByDetector,
        key: unmatchedPrediction.detector,
        counts: { ...emptyMatchCounts, falsePositives: 1 },
      })
    }
    for (const missedExpectation of caseDetail.missedExpectations) {
      addCountsToBreakdown({
        breakdown: countsByDetector,
        key: missedExpectation.detector,
        counts: { ...emptyMatchCounts, falseNegatives: 1 },
      })
    }
  }

  return countsByDetector
}

// key the counts of each case by its category
function computeCountsByCategory(
  caseDetails: BenchmarkCaseDetail[],
): Map<BenchmarkCategory, MatchCounts> {
  const countsByCategory = new Map<BenchmarkCategory, MatchCounts>()
  for (const caseDetail of caseDetails) {
    addCountsToBreakdown({
      breakdown: countsByCategory,
      key: caseDetail.category,
      counts: caseDetail,
    })
  }
  return countsByCategory
}

// the breakdown to add to, the key to add under and the counts to add
interface AddCountsToBreakdownOptions<Key extends string> {
  breakdown: Map<Key, MatchCounts>
  key: Key
  counts: MatchCounts
}

// add counts under one key of a breakdown, starting the key at zero when it is new
function addCountsToBreakdown<Key extends string>({
  breakdown,
  key,
  counts,
}: AddCountsToBreakdownOptions<Key>): void {
  // start a new key at zero, then add the counts
  const existingCounts = breakdown.get(key) ?? emptyMatchCounts
  breakdown.set(
    key,
    addMatchCounts({ firstCounts: existingCounts, secondCounts: counts }),
  )
}

// turn a breakdown of counts into a record of score triples
function toScoreTripleRecord<Key extends string>(
  countsByKey: Map<Key, MatchCounts>,
): Partial<Record<Key, ScoreTriple>> {
  // compute the triple of every key
  const scoreTriplesByKey: Partial<Record<Key, ScoreTriple>> = {}
  for (const [key, counts] of countsByKey) {
    scoreTriplesByKey[key] = computeScoreTriple(counts)
  }
  return scoreTriplesByKey
}

// keep the counts of a case in the shared result shape
function toBenchmarkCaseResult(
  caseDetail: BenchmarkCaseDetail,
): BenchmarkCaseResult {
  return {
    caseId: caseDetail.caseId,
    truePositives: caseDetail.truePositives,
    falsePositives: caseDetail.falsePositives,
    falseNegatives: caseDetail.falseNegatives,
  }
}

// drop the clean flag the breakdowns used and keep the detail the results file records
function toBenchmarkCaseDetail({
  isClean: _isClean,
  ...caseDetail
}: ScoredCase): BenchmarkCaseDetail {
  return caseDetail
}
