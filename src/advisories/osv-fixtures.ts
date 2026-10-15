// reads the real OSV entries under test/fixtures/advisories/osv for the tests in this module
import { join } from 'node:path'

// the directory holding one OSV entry per shape the parser handles
export const osvFixtureDirectory = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'fixtures',
  'advisories',
  'osv',
)

// the fixture files, named for the OSV shape each one shows
export const osvFixtureNames = [
  'affected-without-package',
  'cvss-v3-and-v4',
  'cvss-v4-only',
  'github-reviewed-absent',
  'github-reviewed-false',
  'github-reviewed-true',
  'last-affected',
  'malicious-package',
  'reference-without-scheme',
  'uppercase-name',
  'withdrawn',
] as const
export type OsvFixtureName = (typeof osvFixtureNames)[number]

/**
 * Reads one OSV fixture entry as parsed JSON.
 */
export async function readOsvFixture(
  osvFixtureName: OsvFixtureName,
): Promise<Record<string, unknown>> {
  return Bun.file(join(osvFixtureDirectory, `${osvFixtureName}.json`)).json()
}
