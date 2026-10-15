// runs the module boundary check: cruises src under a root with the repo dependency-cruiser config and lists every violation

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  IConfiguration,
  ICruiseResult,
  IViolation,
} from 'dependency-cruiser'
import { cruise } from 'dependency-cruiser'
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config'

// the repo root is the parent of the scripts directory, and the config lives there
const repositoryRoot = resolve(import.meta.dir, '..')
const boundaryConfigurationPath = join(
  repositoryRoot,
  '.dependency-cruiser.cjs',
)

// the name of the rule against an index.ts inside a module directory, as the config spells it
const noBarrelFilesRuleName = 'no-barrel-files'

interface CheckBoundariesOptions {
  root: string
}

// one import the matrix does not grant, or one barrel file. both paths are relative to the root
interface BoundaryViolation {
  from: string
  to: string
  rule: string
}

interface CheckBoundariesResult {
  violations: BoundaryViolation[]
}

/** Cruises the src tree under root with the repo config and returns every boundary violation. */
export async function checkBoundaries({
  root,
}: CheckBoundariesOptions): Promise<CheckBoundariesResult> {
  // load the matrix from the repo config
  const boundaryConfiguration = await extractDepcruiseConfig(
    boundaryConfigurationPath,
  )

  // cruise the src tree under root against it
  const cruiseResult = await cruiseFromRoot(root, boundaryConfiguration)
  const dependencyViolations =
    cruiseResult.summary.violations.map(toBoundaryViolation)

  // add every barrel file on disk the cruise did not report, so an empty barrel is caught too
  const reportedBarrelViolations = dependencyViolations.filter(
    (violation) => violation.rule === noBarrelFilesRuleName,
  )
  const reportedBarrelPaths = reportedBarrelViolations.map(
    (violation) => violation.from,
  )
  const unreportedBarrelPaths = findBarrelPaths(root).filter(
    (barrelPath) => !reportedBarrelPaths.includes(barrelPath),
  )
  const barrelViolations = unreportedBarrelPaths.map(toBarrelViolation)

  return { violations: [...dependencyViolations, ...barrelViolations] }
}

// cruise src under root with root as the current directory. the tsconfig paths plugin inside
// dependency-cruiser resolves the "@/" alias against the current directory, not against baseDir
async function cruiseFromRoot(
  root: string,
  boundaryConfiguration: IConfiguration,
): Promise<ICruiseResult> {
  // move into root for the duration of the cruise
  const previousWorkingDirectory = process.cwd()
  process.chdir(root)

  // cruise with the repo rules and the tsconfig of the tree being checked, then move back
  try {
    const cruiseOutput = await cruise(['src'], {
      ruleSet: boundaryConfiguration,
      validate: true,
      outputType: 'json',
      baseDir: root,
      tsConfig: { fileName: join(root, 'tsconfig.json') },
    })
    return parseCruiseOutput(cruiseOutput.output)
  } finally {
    process.chdir(previousWorkingDirectory)
  }
}

// turn the json reporter output back into a cruise result
function parseCruiseOutput(
  cruiseOutput: ICruiseResult | string,
): ICruiseResult {
  if (typeof cruiseOutput !== 'string') {
    return cruiseOutput
  }
  return JSON.parse(cruiseOutput) as ICruiseResult
}

// keep the three fields the check reports from a dependency-cruiser violation
function toBoundaryViolation(cruiseViolation: IViolation): BoundaryViolation {
  return {
    from: cruiseViolation.from,
    to: cruiseViolation.to,
    rule: cruiseViolation.rule.name,
  }
}

// list every index.ts directly inside a module directory under root/src, relative to root
function findBarrelPaths(root: string): string[] {
  const sourceEntries = readdirSync(join(root, 'src'), { withFileTypes: true })
  const moduleDirectoryNames = sourceEntries
    .filter((sourceEntry) => sourceEntry.isDirectory())
    .map((sourceEntry) => sourceEntry.name)
  const candidateBarrelPaths = moduleDirectoryNames.map(
    (moduleDirectoryName) => `src/${moduleDirectoryName}/index.ts`,
  )
  return candidateBarrelPaths.filter((barrelPath) =>
    existsSync(join(root, barrelPath)),
  )
}

// report a barrel file found on disk. the file is both ends of the violation
function toBarrelViolation(barrelPath: string): BoundaryViolation {
  return { from: barrelPath, to: barrelPath, rule: noBarrelFilesRuleName }
}

// print every violation to stderr and a one-line summary, then exit 1 when there is any violation
async function runCheckBoundariesCommand(
  rootArgument: string | undefined,
): Promise<void> {
  // check the root given on the command line, or the repo root
  const root =
    rootArgument === undefined ? repositoryRoot : resolve(rootArgument)
  const { violations } = await checkBoundaries({ root })

  // print each violation on its own line
  for (const violation of violations) {
    console.error(`${violation.rule}: ${violation.from} -> ${violation.to}`)
  }

  // print the summary and set the exit code
  const violationWord = violations.length === 1 ? 'violation' : 'violations'
  console.log(
    `boundary check: ${violations.length} ${violationWord} under ${root}`,
  )
  process.exit(violations.length > 0 ? 1 : 0)
}

// run as a command when executed directly
if (import.meta.main) {
  await runCheckBoundariesCommand(process.argv[2])
}
