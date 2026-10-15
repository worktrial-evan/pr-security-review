// tests the HTML report: header values, counts, a row per finding, muted rows, escaping, detail rows, embedding and well-formedness
import { describe, expect, test } from 'bun:test'
import type { ReviewResult } from '../shared/review'
import { fixtureReviewResult } from './fixtures/review-result'
import { scaFixtureFindings } from './fixtures/sca-findings'
import { renderHtmlReport } from './render-html'
import { findTagImbalance } from './tag-balance'

// the fixture report, rendered once for the tests that only read it
const fixtureHtml = renderHtmlReport(fixtureReviewResult)

// read the html of one table row from its opening tag to its closing tag
function readRowHtml(html: string, findingId: string): string {
  const idStart = html.indexOf(`data-finding-id="${findingId}"`)
  expect(idStart).toBeGreaterThan(-1)
  const openingTagStart = html.lastIndexOf('<tr', idStart)
  const rowEnd = html.indexOf('</tr>', idStart)
  return html.slice(openingTagStart, rowEnd + '</tr>'.length)
}

describe('renderHtmlReport header', () => {
  test('shows the run values from the metadata', () => {
    const { metadata } = fixtureReviewResult
    expect(fixtureHtml).toContain(metadata.runId)
    expect(fixtureHtml).toContain(metadata.baseSha)
    expect(fixtureHtml).toContain(metadata.headSha)
    expect(fixtureHtml).toContain(metadata.startedAt)
    expect(fixtureHtml).toContain(
      'href="https://github.com/octocat/hello-world/pull/42"',
    )
    expect(fixtureHtml).toContain('octocat/hello-world#42')
    expect(fixtureHtml).toContain('<dt>Duration</dt><dd>4m 12s</dd>')
    expect(fixtureHtml).toContain('<dt>Total cost</dt><dd>$0.1834</dd>')
    expect(fixtureHtml).toContain(
      '<dt>Advisory snapshot</dt><dd>2026-10-14</dd>',
    )
  })

  test('shows every prompt id with its version and every model id', () => {
    expect(fixtureHtml).toContain('code-review v3')
    expect(fixtureHtml).toContain('summarize v2')
    expect(fixtureHtml).toContain('code-review: claude-sonnet-4-5')
    expect(fixtureHtml).toContain('summarize: claude-haiku-4-5')
  })

  test('shows a dash for a missing advisory snapshot and pull request', () => {
    const { advisorySnapshot, pullRequestReference, ...restOfMetadata } =
      fixtureReviewResult.metadata
    const html = renderHtmlReport({
      ...fixtureReviewResult,
      metadata: restOfMetadata,
    })
    expect(html).toContain('<dt>Advisory snapshot</dt><dd>–</dd>')
    expect(html).toContain('<dt>Pull request</dt><dd>–</dd>')
  })

  test('counts only introduced findings and reports the pre-existing split', () => {
    // five high findings of which the last two were already there
    const highFindings = scaFixtureFindings
      .slice(0, 5)
      .map((finding, index) => ({
        ...finding,
        severity: 'high' as const,
        isIntroducedByPullRequest: index < 3,
      }))
    const result: ReviewResult = {
      ...fixtureReviewResult,
      findings: highFindings,
    }

    const html = renderHtmlReport(result)
    expect(html).toContain('data-severity="high" data-count="3"')
    expect(html).toContain('data-severity="critical" data-count="0"')
    expect(html).toContain('data-detector="sca" data-count="3"')
    expect(html).toContain('2 pre-existing, 3 introduced')
  })
})

describe('renderHtmlReport table', () => {
  test('contains every finding id', () => {
    for (const finding of fixtureReviewResult.findings) {
      expect(fixtureHtml).toContain(`data-finding-id="${finding.id}"`)
    }
  })

  test('has a header cell for each of the 13 columns', () => {
    const headerCellCount = fixtureHtml.match(/<th scope="col"/g)?.length
    expect(headerCellCount).toBe(13)
  })

  test('shows a dash in the seven columns a secrets finding does not have', () => {
    const secretFinding = fixtureReviewResult.findings.find(
      (finding) => finding.detector === 'secrets',
    )
    const rowHtml = readRowHtml(fixtureHtml, secretFinding?.id ?? '')
    const dashCellCount = rowHtml.match(/<td class="empty">–<\/td>/g)?.length
    expect(dashCellCount).toBe(7)
  })

  test('links the advisory id and each alias', () => {
    expect(fixtureHtml).toContain(
      'href="https://osv.dev/vulnerability/GHSA-35jh-r3h4-6jhm"',
    )
    expect(fixtureHtml).toContain(
      'href="https://osv.dev/vulnerability/CVE-2021-23337"',
    )
  })

  test('mutes only the rows of pre-existing findings', () => {
    for (const finding of fixtureReviewResult.findings) {
      const rowHtml = readRowHtml(fixtureHtml, finding.id)
      const isMuted = rowHtml.startsWith('<tr class="finding muted"')
      expect(isMuted).toBe(!finding.isIntroducedByPullRequest)
    }
  })

  test('escapes markup in a title', () => {
    expect(fixtureHtml).toContain(
      'Unescaped &lt;input&gt; value reaches innerHTML',
    )
    expect(fixtureHtml).not.toContain('Unescaped <input>')
  })

  test('offers the seven filters and a shown versus total count', () => {
    const filterColumns = [
      'detector',
      'severity',
      'dependencyScope',
      'githubReviewed',
      'reachability',
      'matcherAgreement',
      'introduced',
    ]
    for (const column of filterColumns) {
      expect(fixtureHtml).toContain(`data-filter="${column}"`)
    }
    const total = fixtureReviewResult.findings.length
    expect(fixtureHtml).toContain(
      `<span id="rows-shown">${total}</span> of <span id="rows-total">${total}</span>`,
    )
  })
})

describe('renderHtmlReport detail rows', () => {
  test('has a collapsed detail row for every finding', () => {
    for (const finding of fixtureReviewResult.findings) {
      expect(fixtureHtml).toContain(
        `<tr class="detail" data-detail-for="${finding.id}" hidden>`,
      )
    }
  })

  test('shows summary, remediation and evidence lines of a code review finding', () => {
    expect(fixtureHtml).toContain(
      'The search term is concatenated into the SQL text.',
    )
    expect(fixtureHtml).toContain('Pass the term as a bound parameter.')
    expect(fixtureHtml).toContain(
      '<li><code>return database.query(sql)</code></li>',
    )
  })

  test('shows the dependency path, importing files and fixed versions of an sca finding', () => {
    expect(fixtureHtml).toContain(
      '<code>mkdirp@0.5.5</code> &gt; <code>minimist@1.2.5</code>',
    )
    expect(fixtureHtml).toContain('<li><code>src/render.ts</code></li>')
    expect(fixtureHtml).toContain('Fixed in 4.17.21')
  })
})

describe('renderHtmlReport document', () => {
  test('is well-formed', () => {
    expect(findTagImbalance(fixtureHtml)).toBeNull()
  })

  test('makes no external request', () => {
    expect(fixtureHtml).not.toMatch(/<link\b/)
    expect(fixtureHtml).not.toMatch(/<img\b/)
    expect(fixtureHtml).not.toMatch(/\bsrc\s*=/)
    expect(fixtureHtml).not.toMatch(/@import/)
    expect(fixtureHtml).not.toMatch(/url\(/)
  })

  test('embeds the rows as JSON that parses and the filter source that runs', () => {
    const dataMatch = fixtureHtml.match(
      /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/,
    )
    const data = JSON.parse(dataMatch?.[1] ?? 'null')
    expect(data.rows).toHaveLength(fixtureReviewResult.findings.length)
    expect(data.severityOrder).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ])
    expect(fixtureHtml).toContain('function selectRows(')
  })

  test('keeps a closing script tag in a title from ending the embedded data', () => {
    // put the closing tag in the title of the first finding
    const findings = fixtureReviewResult.findings.map((finding, index) =>
      index === 0 ? { ...finding, title: '</script><b>x' } : finding,
    )
    const html = renderHtmlReport({ ...fixtureReviewResult, findings })
    expect(html).not.toContain('</script><b>')
    expect(findTagImbalance(html)).toBeNull()
  })
})
