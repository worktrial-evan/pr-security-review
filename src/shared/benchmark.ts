// the benchmark contract: benchmark cases with their snapshot or git source, the findings a case expects and the score of a benchmark run
import { z } from 'zod'
import { detectorKindSchema, severitySchema } from './finding'

// which half of the benchmark a case belongs to
export const benchmarkSplits = ['dev', 'test'] as const
export const benchmarkSplitSchema = z.enum(benchmarkSplits)
export type BenchmarkSplit = z.infer<typeof benchmarkSplitSchema>

// what a case exercises: one detector, a clean pull request or a real-world one
export const benchmarkCategories = [
  'sca',
  'code',
  'secrets',
  'clean',
  'real-world',
] as const
export const benchmarkCategorySchema = z.enum(benchmarkCategories)
export type BenchmarkCategory = z.infer<typeof benchmarkCategorySchema>

// a case checked into the benchmark directory. the objects are strict so a source cannot mix both shapes
export const snapshotBenchmarkSourceSchema = z.strictObject({
  kind: z.literal('snapshot'),
  dir: z.string(),
})
export type SnapshotBenchmarkSource = z.infer<
  typeof snapshotBenchmarkSourceSchema
>

// a case fetched from a git repository at two revisions
export const gitBenchmarkSourceSchema = z.strictObject({
  kind: z.literal('git'),
  repoUrl: z.url(),
  baseSha: z.string(),
  headSha: z.string(),
})
export type GitBenchmarkSource = z.infer<typeof gitBenchmarkSourceSchema>

// where a case's pull request comes from, selected by kind
export const benchmarkSourceSchema = z.discriminatedUnion('kind', [
  snapshotBenchmarkSourceSchema,
  gitBenchmarkSourceSchema,
])
export type BenchmarkSource = z.infer<typeof benchmarkSourceSchema>

// a finding the case expects. only the fields that identify it are set
export const expectedFindingSchema = z.object({
  detector: detectorKindSchema,
  packageName: z.string().optional(),
  advisoryId: z.string().optional(),
  cwe: z.string().optional(),
  file: z.string().optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  severity: severitySchema.optional(),
})
export type ExpectedFinding = z.infer<typeof expectedFindingSchema>

// one benchmark case. isClean marks a case that expects no findings
export const benchmarkCaseSchema = z.object({
  id: z.string(),
  split: benchmarkSplitSchema,
  category: benchmarkCategorySchema,
  isClean: z.boolean(),
  description: z.string(),
  source: benchmarkSourceSchema,
  expected: z.array(expectedFindingSchema),
})
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>

// precision, recall and f1, each between 0 and 1
export const scoreTripleSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
})
export type ScoreTriple = z.infer<typeof scoreTripleSchema>

// how one case scored
export const benchmarkCaseResultSchema = z.object({
  caseId: z.string(),
  truePositives: z.number().int().nonnegative(),
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
})
export type BenchmarkCaseResult = z.infer<typeof benchmarkCaseResultSchema>

// the score of a whole benchmark run, overall and broken down by detector and category
export const benchmarkScoreSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
  byDetector: z.partialRecord(detectorKindSchema, scoreTripleSchema),
  byCategory: z.partialRecord(benchmarkCategorySchema, scoreTripleSchema),
  falsePositivesOnClean: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  caseResults: z.array(benchmarkCaseResultSchema),
})
export type BenchmarkScore = z.infer<typeof benchmarkScoreSchema>
