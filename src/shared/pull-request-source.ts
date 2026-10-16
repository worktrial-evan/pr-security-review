// the pull-request-source contract: the pull request reference, hunks, changed files and the PullRequestSource interface the pipeline reads a pull request through
import { z } from 'zod'

// the pull request a review runs against
export const pullRequestReferenceSchema = z.object({
  owner: z.string(),
  repository: z.string(),
  number: z.number().int().positive(),
  url: z.url(),
})
export type PullRequestReference = z.infer<typeof pullRequestReferenceSchema>

// what a hunk line did: added, removed or context
export const hunkLineKinds = ['added', 'removed', 'context'] as const
export const hunkLineKindSchema = z.enum(hunkLineKinds)
export type HunkLineKind = z.infer<typeof hunkLineKindSchema>

// one line of a hunk with its line number in the head revision
export const hunkLineSchema = z.object({
  kind: hunkLineKindSchema,
  headLine: z.number().int().nonnegative(),
  text: z.string(),
})
export type HunkLine = z.infer<typeof hunkLineSchema>

// one contiguous block of changes in a unified diff
export const hunkSchema = z.object({
  oldStart: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  lines: z.array(hunkLineSchema),
})
export type Hunk = z.infer<typeof hunkSchema>

// what the pull request did to a file
export const changedFileStatuses = [
  'added',
  'modified',
  'deleted',
  'renamed',
] as const
export const changedFileStatusSchema = z.enum(changedFileStatuses)
export type ChangedFileStatus = z.infer<typeof changedFileStatusSchema>

// a line the pull request added, with its line number in the head revision
export const addedLineSchema = z.object({
  line: z.number().int().positive(),
  text: z.string(),
})
export type AddedLine = z.infer<typeof addedLineSchema>

// a file the pull request touched. previousPath is the old path of a renamed file
export const changedFileSchema = z.object({
  path: z.string(),
  status: changedFileStatusSchema,
  previousPath: z.string().optional(),
  hunks: z.array(hunkSchema),
  addedLines: z.array(addedLineSchema),
  isBinary: z.boolean(),
})
export type ChangedFile = z.infer<typeof changedFileSchema>

// the two revisions a review compares, with the pull request when there is one
export const pullRequestDescriptionSchema = z.object({
  baseSha: z.string(),
  headSha: z.string(),
  pullRequestReference: pullRequestReferenceSchema.optional(),
})
export type PullRequestDescription = z.infer<
  typeof pullRequestDescriptionSchema
>

// how the pipeline reads a pull request, whatever backs it. checkoutHead returns the directory holding the head revision
export interface PullRequestSource {
  describe(): Promise<PullRequestDescription>
  listChangedFiles(): Promise<ChangedFile[]>
  readFileAtBase(path: string): Promise<string | null>
  readFileAtHead(path: string): Promise<string | null>
  checkoutHead(): Promise<string>
  dispose(): Promise<void>
}
