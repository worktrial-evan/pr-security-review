// tests for the results page: the metrics rows, the case rows with their filter attributes, the warnings and html escaping
import { expect, test } from 'bun:test'
import { emptyValueText } from '@/report/report-format'
import { codeReviewFindingSample } from '@/shared/finding.samples'
import { renderResultsPage } from './results-page'
import type { BenchmarkRunResults } from './run-results'
import { scoreBenchmark } from './score'

// a run over one code case with a matched prediction and one skipped git case
const score = scoreBenchmark({
  caseOutcomes: [
    {
      benchmarkCase: {
        id: 'code-01-sql',
        split: 'dev',
        category: 'code',
        isClean: false,
        description: 'the sample case',
        source: { kind: 'snapshot', directory: 'benchmark/cases/code-01-sql' },
        expected: [{ detector: 'code-review', vulnerabilityType: 'CWE-89' }],
      },
      findings: [codeReviewFindingSample],
      costUsd: 0.0125,
      durationMs: 1500.4,
      status: 'completed',
    },
    {
      benchmarkCase: {
        id: 'real-world-01-skip',
        split: 'test',
        category: 'real-world',
        isClean: false,
        description: 'the skipped case',
        source: {
          kind: 'git',
          repositoryUrl: 'https://example.invalid/owner/repository.git',
          baseSha: '0123456789abcdef0123456789abcdef01234567',
          headSha: 'fedcba9876543210fedcba9876543210fedcba98',
        },
        expected: [{ detector: 'code-review', vulnerabilityType: 'CWE-79' }],
      },
      findings: [],
      costUsd: 0,
      durationMs: 0,
      status: 'skipped',
      errorMessage: 'cannot reach <the repository>',
    },
  ],
})

// the results of that run, with a label that needs escaping
const results: BenchmarkRunResults = {
  label: 'a & b <c>',
  split: 'dev',
  startedAt: '2026-10-15T20:15:00.000Z',
  finishedAt: '2026-10-15T20:15:01.000Z',
  gitSha: '0123456789abcdef0123456789abcdef01234567',
  promptVersions: { 'code-review': 'v3' },
  modelIds: {},
  advisorySnapshotDate: '2026-10-01T00:00:00.000Z',
  isLlmCacheUsed: false,
  score,
  cases: score.caseDetails,
  warnings: ['real-world-01-skip: skipped, cannot reach <the repository>'],
}

test('renders the overall row and one breakdown row per detector and category that scored', () => {
  const pageHtml = renderResultsPage(results)
  expect(pageHtml).toContain(
    '<td>overall</td>\n<td class="number">1.000</td>\n<td class="number">1.000</td>\n<td class="number">1.000</td>',
  )
  expect(pageHtml).toContain('<td>detector: code-review</td>')
  expect(pageHtml).toContain('<td>category: code</td>')
  expect(pageHtml).not.toContain('<td>category: real-world</td>')
})

test('renders one row per case with the attributes the filters read and the formatted totals', () => {
  const pageHtml = renderResultsPage(results)
  expect(pageHtml).toContain(
    '<tr data-case="code-01-sql" data-category="code" data-split="dev" data-status="completed">',
  )
  expect(pageHtml).toContain(
    '<tr data-case="real-world-01-skip" data-category="real-world" data-split="test" data-status="skipped">',
  )
  expect(pageHtml).toContain('<td class="number">$0.0125</td>')
  expect(pageHtml).toContain('<td class="number">1500 ms</td>')
  expect(pageHtml).toContain(`<dt>Model ids</dt><dd>${emptyValueText}</dd>`)
  expect(pageHtml).toContain('<dt>LLM cache used</dt><dd>false</dd>')
})

test('escapes html in the label, the warnings and the error messages', () => {
  const pageHtml = renderResultsPage(results)
  expect(pageHtml).toContain(
    '<title>Benchmark run a &amp; b &lt;c&gt; (dev)</title>',
  )
  expect(pageHtml).toContain(
    '<li class="warning">real-world-01-skip: skipped, cannot reach &lt;the repository&gt;</li>',
  )
  expect(pageHtml).toContain('<td>cannot reach &lt;the repository&gt;</td>')
  expect(pageHtml).not.toContain('<the repository>')
})

test('leaves the warnings section out when there are none', () => {
  const pageHtml = renderResultsPage({ ...results, warnings: [] })
  expect(pageHtml).not.toContain('<h2>Warnings</h2>')
})
