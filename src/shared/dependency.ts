// the dependency contract: resolved versions, the dependency set a lockfile parses to, the diff between two sets and the DependencyGraph interface
import { z } from 'zod'

// whether a dependency ships to production or is only used in development
export const dependencyScopes = ['production', 'development'] as const
export const dependencyScopeSchema = z.enum(dependencyScopes)
export type DependencyScope = z.infer<typeof dependencyScopeSchema>

// one resolved version of a package in a lockfile. dependencyKeys lists what it depends on as name@version
export const dependencyVersionSchema = z.object({
  name: z.string(),
  version: z.string(),
  scope: dependencyScopeSchema,
  isDirect: z.boolean(),
  isWorkspace: z.boolean(),
  isVersionUnparseable: z.boolean(),
  realPackageName: z.string().optional(),
  dependencyKeys: z.array(z.string()),
})
export type DependencyVersion = z.infer<typeof dependencyVersionSchema>

// the lockfile formats a dependency set can come from
export const lockfileKinds = ['bun', 'npm'] as const
export const lockfileKindSchema = z.enum(lockfileKinds)
export type LockfileKind = z.infer<typeof lockfileKindSchema>

// every resolved version in one lockfile, grouped by package name
export const dependencySetSchema = z.object({
  lockfileKind: lockfileKindSchema,
  lockfilePath: z.string(),
  versionsByDependency: z.map(z.string(), z.array(dependencyVersionSchema)),
  directDependencyNames: z.set(z.string()),
})
export type DependencySet = z.infer<typeof dependencySetSchema>

// a package whose version differs between the base and head dependency sets
export const dependencyChangeSchema = z.object({
  name: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
})
export type DependencyChange = z.infer<typeof dependencyChangeSchema>

// what changed between the base and head dependency sets
export const dependencyDiffSchema = z.object({
  added: z.array(dependencyVersionSchema),
  removed: z.array(dependencyVersionSchema),
  changed: z.array(dependencyChangeSchema),
  unchangedCount: z.number().int().nonnegative(),
})
export type DependencyDiff = z.infer<typeof dependencyDiffSchema>

// the graph of one dependency set. shortestPathTo returns name@version entries from a direct dependency down to the named package
export interface DependencyGraph {
  shortestPathTo(name: string): string[]
}
