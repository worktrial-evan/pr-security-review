// tests the import scan over a temporary copy of the sample repository with excluded directories and symbolic links added

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AuditEvent,
  type AuditSink,
  auditEventSchema,
} from '@/shared/audit'
import {
  collectImports,
  type ImportCollection,
  reachabilityAuditStep,
} from './collect-imports'
import { excludedDirectoryNames } from './source-files'

// the fixture repository copied into each temporary root
const sampleRepositoryDir = join(import.meta.dir, 'fixtures', 'sample-repo')

// the packages the sample repository imports and the files importing each
const expectedImports = new Map([
  ['@acme/logger', ['src/main.ts', 'src/view.tsx']],
  ['default-import', ['src/main.ts']],
  ['dynamic-import', ['src/lazy.mts']],
  ['esm-import', ['src/esm.mjs']],
  ['export-from', ['src/main.ts']],
  ['export-star', ['src/main.ts']],
  ['import-equals', ['src/legacy-module.cts']],
  ['left-pad', ['src/legacy.cjs']],
  ['lodash', ['src/main.ts', 'src/plain.js']],
  ['named-import', ['src/main.ts']],
  ['namespace-import', ['src/main.ts']],
  ['react', ['src/view.tsx']],
  ['react-dom', ['src/widget.jsx']],
  ['side-effect-import', ['src/main.ts']],
  ['template-require', ['src/legacy.cjs']],
])

// the number of source files in the sample repository
const sampleSourceFileCount = 9

let temporaryDir = ''
let rootDir = ''
let auditEvents: AuditEvent[] = []
let importCollection: ImportCollection

// copy the fixture, add the files the scan must skip and scan it once
beforeAll(async () => {
  temporaryDir = await mkdtemp(join(tmpdir(), 'reachability-'))
  rootDir = join(temporaryDir, 'repo')
  await cp(sampleRepositoryDir, rootDir, { recursive: true })
  await addSkippedFiles()
  importCollection = await collectImports({
    rootDir,
    auditSink: createRecordingAuditSink(),
    runId: 'run-1',
  })
})

afterAll(async () => {
  await rm(temporaryDir, { recursive: true, force: true })
})

describe('collectImports', () => {
  test('maps every imported package to the files importing it', () => {
    expect(importCollection.imports).toEqual(expectedImports)
  })

  test('keeps the scope and drops the subpath', () => {
    expect(importCollection.imports.get('@acme/logger')).toEqual([
      'src/main.ts',
      'src/view.tsx',
    ])
    expect(importCollection.imports.has('lodash/merge')).toBe(false)
  })

  test.each([
    'type-only-import',
    'type-only-export',
    'computed-dynamic',
    'computed-require',
    'path',
    'fs',
    'bun',
  ])('leaves out %s', (packageName) => {
    expect(importCollection.imports.has(packageName)).toBe(false)
  })

  test.each([
    ...[...excludedDirectoryNames].map((name) => `from-${name}`),
    'from-linked-directory',
    'from-linked-file',
  ])('never reads the file importing %s', (packageName) => {
    expect(importCollection.imports.has(packageName)).toBe(false)
  })

  test('counts the parsed files without warnings', () => {
    expect(importCollection.fileCount).toBe(sampleSourceFileCount)
    expect(importCollection.warnings).toEqual([])
  })

  test('writes the file count and parse time to the audit sink', () => {
    const scanEvent = auditEvents[0]
    expect(auditEvents).toHaveLength(1)
    expect(auditEventSchema.safeParse(scanEvent).success).toBe(true)
    expect(scanEvent?.step).toBe(reachabilityAuditStep)
    expect(scanEvent?.payload.fileCount).toBe(sampleSourceFileCount)
    expect(scanEvent?.payload.parseDurationMs).toBe(
      importCollection.parseDurationMs,
    )
  })

  test('stops at the file cap with a warning', async () => {
    const cappedImportCollection = await collectImports({
      rootDir,
      auditSink: createRecordingAuditSink(),
      runId: 'run-2',
      maxFileCount: 3,
    })
    expect(cappedImportCollection.fileCount).toBe(3)
    expect(cappedImportCollection.warnings).toEqual([
      'stopped at the file cap of 3 files, so imports in later files are missing',
    ])
    expect(auditEvents[0]?.payload.isFileCapReached).toBe(true)
  })

  test('raises no warning when the cap equals the file count', async () => {
    const exactImportCollection = await collectImports({
      rootDir,
      auditSink: createRecordingAuditSink(),
      runId: 'run-3',
      maxFileCount: sampleSourceFileCount,
    })
    expect(exactImportCollection.warnings).toEqual([])
    expect(exactImportCollection.imports).toEqual(expectedImports)
  })
})

// add an importing file in every excluded directory and symbolic links to files outside the root
async function addSkippedFiles(): Promise<void> {
  // write one importing file inside each excluded directory, at the root and nested
  for (const directoryName of excludedDirectoryNames) {
    const importLine = `import 'from-${directoryName}'\n`
    await Bun.write(join(rootDir, directoryName, 'index.js'), importLine)
    await Bun.write(join(rootDir, 'src', directoryName, 'index.ts'), importLine)
  }

  // link a directory and a file that live outside the root
  const outsideDir = join(temporaryDir, 'outside')
  await Bun.write(
    join(outsideDir, 'linked.ts'),
    "import 'from-linked-directory'\n",
  )
  await Bun.write(
    join(temporaryDir, 'linked-file.ts'),
    "import 'from-linked-file'\n",
  )
  await symlink(outsideDir, join(rootDir, 'src', 'linked-directory'))
  await symlink(
    join(temporaryDir, 'linked-file.ts'),
    join(rootDir, 'src', 'linked-file.ts'),
  )
}

// build an audit sink that replaces the recorded events with the ones it receives
function createRecordingAuditSink(): AuditSink {
  auditEvents = []
  return {
    write: async (event: AuditEvent): Promise<void> => {
      auditEvents.push(event)
    },
  }
}
