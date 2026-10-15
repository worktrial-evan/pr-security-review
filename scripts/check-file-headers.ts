// checks that every .ts file under the given roots starts with a // comment stating what the file does

import { existsSync, statSync } from 'node:fs'
import { join, sep as pathSeparator } from 'node:path'

// the roots scanned when the command line names none
const defaultRoots = ['src', 'scripts', 'benchmark']

// every .ts file below a root, at any depth
const typescriptFileGlob = new Bun.Glob('**/*.ts')

// the directories to scan
export interface CheckFileHeadersOptions {
  roots: string[]
}

// one file that breaks the header rule, and why
export interface FileHeaderOffense {
  filePath: string
  reason: string
}

/**
 * Returns every .ts file under the roots whose header comment is missing or malformed.
 */
export async function checkFileHeaders({
  roots,
}: CheckFileHeadersOptions): Promise<FileHeaderOffense[]> {
  const offenses: FileHeaderOffense[] = []

  // check each root, skipping one that is missing
  for (const root of roots) {
    if (!isDirectory(root)) {
      continue
    }
    const rootOffenses = await checkRoot(root)
    offenses.push(...rootOffenses)
  }

  return offenses
}

// tell whether a path names an existing directory
function isDirectory(path: string): boolean {
  if (!existsSync(path)) {
    return false
  }
  return statSync(path).isDirectory()
}

// check every .ts file under one root, in path order
async function checkRoot(root: string): Promise<FileHeaderOffense[]> {
  const offenses: FileHeaderOffense[] = []

  // list the files, leaving out anything under node_modules
  const relativePaths = await Array.fromAsync(
    typescriptFileGlob.scan({ cwd: root, onlyFiles: true }),
  )
  const relevantRelativePaths = relativePaths.filter(
    (relativePath) => !isUnderNodeModules(relativePath),
  )
  relevantRelativePaths.sort()

  // record each file that breaks the rule
  for (const relativePath of relevantRelativePaths) {
    const filePath = join(root, relativePath)
    const reason = await findHeaderOffenseReason(filePath)
    if (reason === null) {
      continue
    }
    offenses.push({ filePath, reason })
  }

  return offenses
}

// tell whether a relative path has a node_modules segment
function isUnderNodeModules(relativePath: string): boolean {
  const segments = relativePath.split(pathSeparator)
  return segments.includes('node_modules')
}

// return why a file breaks the header rule, or null when it follows the rule
async function findHeaderOffenseReason(
  filePath: string,
): Promise<string | null> {
  // read the first two lines
  const fileText = await Bun.file(filePath).text()
  const lines = fileText.split('\n')
  const firstLine = lines[0] ?? ''
  const secondLine = lines[1] ?? ''

  // accept a // comment on line 1
  if (firstLine.startsWith('//')) {
    return null
  }

  // accept a shebang on line 1 when a // comment follows on line 2
  if (firstLine.startsWith('#!')) {
    if (secondLine.startsWith('//')) {
      return null
    }
    return 'line 2 after the shebang is not a // comment'
  }

  // name the shape of the bad first line
  if (firstLine.trim() === '') {
    return 'line 1 is blank'
  }
  if (firstLine.startsWith('/*')) {
    return 'line 1 is a /* */ block comment instead of a // comment'
  }
  return 'line 1 is not a // comment'
}

// run as a command: print each offender to stderr and exit 1 when any file breaks the rule
async function runFromCommandLine(): Promise<void> {
  // take the roots from the arguments, falling back to the defaults
  const argumentRoots = process.argv.slice(2)
  const roots = argumentRoots.length > 0 ? argumentRoots : defaultRoots

  // report every offender with its reason
  const offenses = await checkFileHeaders({ roots })
  for (const offense of offenses) {
    console.error(`${offense.filePath}: ${offense.reason}`)
  }

  process.exit(offenses.length > 0 ? 1 : 0)
}

// run the check only when this file is the entry point, not when a test imports it
if (import.meta.main) {
  await runFromCommandLine()
}
