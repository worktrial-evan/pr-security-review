// the shape of a benchmark results file: the provenance of the run, the score with its case details and the warnings
import { z } from 'zod'
import {
  benchmarkCategorySchema,
  benchmarkScoreSchema,
  benchmarkSplitSchema,
  expectedFindingSchema,
} from '@/shared/benchmark'
import { findingSchema } from '@/shared/finding'
import { benchmarkCaseStatuses } from './score'

// how one case ended
const benchmarkCaseStatusSchema = z.enum(benchmarkCaseStatuses)

// an expected finding and the predicted finding that matched it
const matchedFindingPairSchema = z.object({
  expectedFinding: expectedFindingSchema,
  predictedFinding: findingSchema,
})

// everything the scorer decided about one case, as the results file records it
const benchmarkCaseDetailSchema = z.object({
  caseId: z.string(),
  category: benchmarkCategorySchema,
  split: benchmarkSplitSchema,
  status: benchmarkCaseStatusSchema,
  errorMessage: z.string().optional(),
  truePositives: z.number().int().nonnegative(),
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
  matchedPairs: z.array(matchedFindingPairSchema),
  unmatchedPredictions: z.array(findingSchema),
  missedExpectations: z.array(expectedFindingSchema),
  preExistingFindings: z.array(findingSchema),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
})

// the shared score with the per-case detail attached
const benchmarkRunScoreSchema = benchmarkScoreSchema.extend({
  caseDetails: z.array(benchmarkCaseDetailSchema),
})

// the results of one run: provenance, the score and the detail of every case
export const benchmarkRunResultsSchema = z.object({
  label: z.string(),
  split: benchmarkSplitSchema,
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  gitSha: z.string(),
  promptVersions: z.record(z.string(), z.string()),
  modelIds: z.record(z.string(), z.string()),
  advisorySnapshotDate: z.string(),
  isLlmCacheUsed: z.boolean(),
  score: benchmarkRunScoreSchema,
  cases: z.array(benchmarkCaseDetailSchema),
  warnings: z.array(z.string()),
})
export type BenchmarkRunResults = z.infer<typeof benchmarkRunResultsSchema>
