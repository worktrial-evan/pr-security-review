// the on-disk llm response cache: one llm/<key>.json file per request under the cache directory
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { llmUsageSchema } from '@/shared/llm'

// one cached response: the validated raw output and the usage of the call that produced it
export const llmCacheEntrySchema = z.object({
  modelId: z.string(),
  promptId: z.string(),
  rawOutput: z.unknown(),
  usage: llmUsageSchema,
  createdAt: z.iso.datetime({ offset: true }),
})
export type LlmCacheEntry = z.infer<typeof llmCacheEntrySchema>

// the request fields the cache key covers
export interface CreateLlmCacheKeyOptions {
  modelId: string
  promptHash: string
  system: string
  user: string
  outputJsonSchema: Record<string, unknown>
}

// where a cache entry lives
export interface LlmCacheLocation {
  cacheDirectory: string
  cacheKey: string
}

// a cache entry and where to write it
export interface WriteLlmCacheEntryOptions extends LlmCacheLocation {
  llmCacheEntry: LlmCacheEntry
}

/**
 * Returns the sha256 cache key of a request's model, prompt hash, texts and output schema.
 */
export function createLlmCacheKey({
  modelId,
  promptHash,
  system,
  user,
  outputJsonSchema,
}: CreateLlmCacheKeyOptions): string {
  // serialize as an array so no two field splits give the same text
  const cacheKeyInput = JSON.stringify([
    modelId,
    promptHash,
    system,
    user,
    outputJsonSchema,
  ])
  return createHash('sha256').update(cacheKeyInput).digest('hex')
}

/**
 * Returns the path of the cache file for a key: llm/<key>.json under the cache directory.
 */
export function resolveLlmCacheFilePath({
  cacheDirectory,
  cacheKey,
}: LlmCacheLocation): string {
  return join(cacheDirectory, 'llm', `${cacheKey}.json`)
}

/**
 * Reads a cache entry, or returns null when it is missing, unreadable or invalid.
 */
export async function readLlmCacheEntry(
  llmCacheLocation: LlmCacheLocation,
): Promise<LlmCacheEntry | null> {
  // a missing file is a miss
  const llmCacheFile = Bun.file(resolveLlmCacheFilePath(llmCacheLocation))
  if (!(await llmCacheFile.exists())) {
    return null
  }

  // a file that is not JSON or not an entry is a miss too
  const cacheEntryValue: unknown = await llmCacheFile.json().catch(() => null)
  const llmCacheEntryResult = llmCacheEntrySchema.safeParse(cacheEntryValue)
  if (!llmCacheEntryResult.success) {
    return null
  }
  return llmCacheEntryResult.data
}

/**
 * Writes a cache entry through a temporary file and a rename, so a reader never sees half a file.
 */
export async function writeLlmCacheEntry({
  cacheDirectory,
  cacheKey,
  llmCacheEntry,
}: WriteLlmCacheEntryOptions): Promise<void> {
  // create the llm directory under the cache directory
  const llmCacheFilePath = resolveLlmCacheFilePath({ cacheDirectory, cacheKey })
  await mkdir(join(cacheDirectory, 'llm'), { recursive: true })

  // write beside the target and move it into place
  const temporaryFilePath = `${llmCacheFilePath}.${randomUUID()}.tmp`
  await Bun.write(temporaryFilePath, JSON.stringify(llmCacheEntry))
  await rename(temporaryFilePath, llmCacheFilePath)
}
