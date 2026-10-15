// tests the file header check against the header fixtures and a clean temporary tree

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { checkFileHeaders } from './check-file-headers'

// the checked-in fixture tree with three offenders and two headed files
const headerFixturesRoot = join(
  import.meta.dir,
  '..',
  'test',
  'fixtures',
  'headers',
)

// a throwaway tree holding only headed files, plus a headerless file under node_modules
let cleanRoot = ''

// build the throwaway tree once for the whole file
beforeAll(async () => {
  cleanRoot = await mkdtemp(join(tmpdir(), 'check-file-headers-'))
  await Bun.write(
    join(cleanRoot, 'headed.ts'),
    '// a headed file\nexport const isHeaded = true\n',
  )
  await Bun.write(
    join(cleanRoot, 'nested', 'shebang.ts'),
    '#!/usr/bin/env bun\n// a headed script\nexport const isHeaded = true\n',
  )
  await Bun.write(
    join(cleanRoot, 'node_modules', 'package', 'headerless.ts'),
    'export const isHeaded = false\n',
  )
})

// remove the throwaway tree
afterAll(async () => {
  await rm(cleanRoot, { recursive: true, force: true })
})

describe('checkFileHeaders', () => {
  test('reports exactly the headerless, block comment and blank first line fixtures', async () => {
    const offenses = await checkFileHeaders({ roots: [headerFixturesRoot] })

    // compare by file name so the fixture location does not matter
    const reportedOffenses = offenses.map((offense) => ({
      fileName: basename(offense.filePath),
      reason: offense.reason,
    }))
    expect(reportedOffenses).toEqual([
      { fileName: 'blank-first-line.ts', reason: 'line 1 is blank' },
      {
        fileName: 'block-comment.ts',
        reason: 'line 1 is a /* */ block comment instead of a // comment',
      },
      { fileName: 'headerless.ts', reason: 'line 1 is not a // comment' },
    ])
  })

  test('returns an empty list for a root with only headed files', async () => {
    const offenses = await checkFileHeaders({ roots: [cleanRoot] })
    expect(offenses).toEqual([])
  })

  test('skips a missing root instead of failing', async () => {
    const missingRoot = join(cleanRoot, 'does-not-exist')
    const offenses = await checkFileHeaders({ roots: [missingRoot] })
    expect(offenses).toEqual([])
  })

  test('reports offenders from every root given', async () => {
    const offenses = await checkFileHeaders({
      roots: [cleanRoot, headerFixturesRoot],
    })
    expect(offenses).toHaveLength(3)
  })
})
