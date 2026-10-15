// maps an import specifier to the npm package it names, or to null for a builtin, a relative path or an alias path
import { builtinModules } from 'node:module'

// every builtin module name Bun knows: the node builtins, bun and the bun: modules
const builtinModuleNames = new Set<string>(builtinModules)

// the leading characters of a relative, absolute or alias specifier
const localSpecifierPrefixes = ['.', '/', '~', '#', '@/']

/**
 * Returns the npm package a module specifier names, or null for a builtin, a relative path or an alias path.
 */
export function toPackageName(specifier: string): string | null {
  // ignore an empty specifier and relative, absolute and alias paths
  const isLocalSpecifier = localSpecifierPrefixes.some((prefix) =>
    specifier.startsWith(prefix),
  )
  if (specifier === '' || isLocalSpecifier) {
    return null
  }

  // ignore a specifier with a protocol: node:, bun:, https: and the like
  if (specifier.includes(':')) {
    return null
  }

  // ignore a builtin and any subpath of one
  const pathSegments = specifier.split('/')
  const firstSegment = pathSegments[0] ?? ''
  if (builtinModuleNames.has(firstSegment)) {
    return null
  }

  // keep the scope of a scoped package and drop any subpath
  if (firstSegment.startsWith('@')) {
    const scopedSegment = pathSegments[1]
    if (!scopedSegment) {
      return null
    }
    return `${firstSegment}/${scopedSegment}`
  }
  return firstSegment
}
