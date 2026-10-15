// writes the fixture review result as an HTML report and a JSON report into runs/ so the HTML can be opened in a browser
import { join } from 'node:path'
import { renderHtmlReport } from '../render-html'
import { renderJsonReport } from '../render-json'
import { fixtureReviewResult } from './review-result'

// the repository folder for generated output. it is gitignored and left out of the lint check
const outputDirectory = join(import.meta.dir, '..', '..', '..', 'runs')

// the two files the script writes
export interface FixtureReportPaths {
  htmlPath: string
  jsonPath: string
}

/**
 * Writes the fixture HTML and JSON reports and returns where they are.
 */
export async function writeFixtureReport(): Promise<FixtureReportPaths> {
  // render both reports from the fixture
  const htmlPath = join(outputDirectory, 'fixture-report.html')
  const jsonPath = join(outputDirectory, 'fixture-report.json')
  const html = renderHtmlReport(fixtureReviewResult)
  const json = renderJsonReport(fixtureReviewResult)

  // write them, creating the folder when it is missing
  await Bun.write(htmlPath, html)
  await Bun.write(jsonPath, json)
  return { htmlPath, jsonPath }
}

// run as a command: print where the reports were written
if (import.meta.main) {
  const { htmlPath, jsonPath } = await writeFixtureReport()
  console.log(htmlPath)
  console.log(jsonPath)
}
