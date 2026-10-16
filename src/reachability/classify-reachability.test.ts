// tests the classification of the sample dependencies against one scan of the sample repository

import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import type { AuditEvent } from '@/shared/audit'
import {
  classifyReachability,
  type ReachabilityClassification,
} from './classify-reachability'
import { collectImports, type ImportsByPackage } from './collect-imports'
import {
  buildSampleDependencyGraph,
  buildSampleDependencySet,
} from './fixtures/sample-dependencies'

// the fixture repository scanned once for every case
const sampleRepositoryDirectory = join(
  import.meta.dir,
  'fixtures',
  'sample-repository',
)

// the head dependency set and graph every case shares
const dependencySet = buildSampleDependencySet()
const dependencyGraph = buildSampleDependencyGraph()

const auditEvents: AuditEvent[] = []
let imports: ImportsByPackage = new Map()

// scan the sample repository once
beforeAll(async () => {
  const importCollection = await collectImports({
    rootDirectory: sampleRepositoryDirectory,
    auditSink: {
      write: async (event: AuditEvent): Promise<void> => {
        auditEvents.push(event)
      },
    },
    runId: 'run-1',
  })
  imports = importCollection.imports
})

// classify one package against the shared scan
function classify(packageName: string): ReachabilityClassification {
  return classifyReachability({
    packageName,
    dependencySet,
    dependencyGraph,
    imports,
  })
}

describe('classifyReachability', () => {
  test('marks an imported direct dependency direct-imported with its files', () => {
    expect(classify('lodash')).toEqual({
      reachability: 'direct-imported',
      importedBy: ['src/main.ts', 'src/plain.js'],
      dependencyPath: ['lodash@4.17.21'],
    })
  })

  test('marks a scoped package imported by subpath and by root direct-imported', () => {
    expect(classify('@acme/logger')).toEqual({
      reachability: 'direct-imported',
      importedBy: ['src/main.ts', 'src/view.tsx'],
      dependencyPath: ['@acme/logger@2.0.0'],
    })
  })

  test('marks a required direct dependency direct-imported', () => {
    expect(classify('left-pad').reachability).toBe('direct-imported')
  })

  test('marks a direct dependency no file imports direct-unused', () => {
    expect(classify('unused-direct')).toEqual({
      reachability: 'direct-unused',
      importedBy: [],
      dependencyPath: ['unused-direct@3.0.0'],
    })
  })

  test('marks a transitive dependency with the shortest path from a direct dependency', () => {
    expect(classify('deep-transitive')).toEqual({
      reachability: 'transitive',
      importedBy: [],
      dependencyPath: ['lodash@4.17.21', 'deep-transitive@0.1.0'],
    })
    expect(classify('chalk-lite').dependencyPath).toEqual([
      '@acme/logger@2.0.0',
      'chalk-lite@1.0.0',
    ])
  })

  test('marks an imported package missing from the direct dependencies direct-imported', () => {
    expect(classify('react')).toEqual({
      reachability: 'direct-imported',
      importedBy: ['src/view.tsx'],
      dependencyPath: [],
    })
  })

  test('returns importedBy as a copy of the scan', () => {
    const classification = classify('lodash')
    classification.importedBy.push('src/extra.ts')
    expect(imports.get('lodash')).toEqual(['src/main.ts', 'src/plain.js'])
  })

  test('reuses the one scan across every classification', () => {
    expect(auditEvents).toHaveLength(1)
  })
})
