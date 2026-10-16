// the install nodes every lockfile parser returns, the parser signature and the join of root and workspace locations
import type { ManifestLocations, PackageManifest } from './package-manifest'

// one installed copy of a package at one location in a lockfile. dependencyLocations are the locations its dependencies resolve to
export interface LockfileNode {
  location: string
  name: string
  version: string
  realPackageName?: string
  isWorkspace: boolean
  dependencyLocations: string[]
}

// what a parser reads from one lockfile. the root locations are where the root and workspace dependencies resolve to
export interface ParsedLockfile {
  nodes: LockfileNode[]
  productionRootLocations: string[]
  developmentRootLocations: string[]
  directLocations: string[]
}

// the lockfile text and the root package.json it goes with
export interface LockfileParserOptions {
  content: string
  rootManifest: PackageManifest
}

// a parser turns the text of one lockfile kind into install nodes
export type LockfileParser = (options: LockfileParserOptions) => ParsedLockfile

// the nodes, the root package.json locations and the locations of every workspace entry
export interface ToParsedLockfileOptions {
  nodes: LockfileNode[]
  rootManifestLocations: ManifestLocations
  workspaceManifestLocations: ManifestLocations[]
}

/** Joins the root and workspace locations into a parsed lockfile. Only the root package.json decides which locations are direct. */
export function toParsedLockfile({
  nodes,
  rootManifestLocations,
  workspaceManifestLocations,
}: ToParsedLockfileOptions): ParsedLockfile {
  const allManifestLocations = [
    rootManifestLocations,
    ...workspaceManifestLocations,
  ]
  return {
    nodes,
    productionRootLocations: allManifestLocations.flatMap(
      (manifestLocations) => manifestLocations.productionLocations,
    ),
    developmentRootLocations: allManifestLocations.flatMap(
      (manifestLocations) => manifestLocations.developmentLocations,
    ),
    directLocations: rootManifestLocations.directLocations,
  }
}
