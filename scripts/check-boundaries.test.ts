// tests the boundary check against a fixture tree with violations and a fixture tree without

import { describe, expect, test } from 'bun:test'
import { join, resolve } from 'node:path'
import { checkBoundaries } from './check-boundaries'

// the fixture trees live under test/fixtures beside the scripts directory
const fixturesRoot = resolve(import.meta.dir, '../test/fixtures')
const badFixtureRoot = join(fixturesRoot, 'boundaries')
const cleanFixtureRoot = join(fixturesRoot, 'boundaries-clean')

describe('checkBoundaries', () => {
  test('reports the relative import, the alias import and the barrels in the bad fixture', async () => {
    // run the check on the fixture with deliberate violations
    const { violations } = await checkBoundaries({ root: badFixtureRoot })
    const violationSources = violations.map((violation) => violation.from)
    const violatedRuleNames = violations.map((violation) => violation.rule)

    // expect every offending file to be named
    expect(violationSources).toContain('src/shared/bad.ts')
    expect(violationSources).toContain('src/audit/alias-bad.ts')
    expect(violationSources).toContain('src/llm/index.ts')
    expect(violationSources).toContain('src/report/index.ts')

    // expect every broken rule to be named
    expect(violatedRuleNames).toContain('boundary-shared')
    expect(violatedRuleNames).toContain('boundary-audit')
    expect(violatedRuleNames).toContain('no-barrel-files')
  })

  test('resolves the alias import to the file inside the target module', async () => {
    const { violations } = await checkBoundaries({ root: badFixtureRoot })
    expect(violations).toContainEqual({
      from: 'src/audit/alias-bad.ts',
      to: 'src/llm/thing.ts',
      rule: 'boundary-audit',
    })
  })

  test('reports each barrel file once', async () => {
    const { violations } = await checkBoundaries({ root: badFixtureRoot })
    const barrelViolations = violations.filter(
      (violation) => violation.rule === 'no-barrel-files',
    )
    const barrelSources = barrelViolations.map((violation) => violation.from)
    expect(barrelSources.sort()).toEqual([
      'src/llm/index.ts',
      'src/report/index.ts',
    ])
  })

  test('reports nothing on the clean fixture', async () => {
    const { violations } = await checkBoundaries({ root: cleanFixtureRoot })
    expect(violations).toEqual([])
  })

  test('leaves the current directory where it was', async () => {
    const workingDirectoryBefore = process.cwd()
    await checkBoundaries({ root: badFixtureRoot })
    expect(process.cwd()).toBe(workingDirectoryBefore)
  })
})
