// renders the report header: run details, counts of introduced findings and the pre-existing versus introduced line
import { detectorKinds, type Finding, severities } from '../shared/finding'
import type { ReviewMetadata, ReviewResult } from '../shared/review'
import { escapeHtml, renderLink } from './html-escape'
import { emptyValueText, formatCostUsd, formatDuration } from './report-format'

// one labelled run detail whose value is already HTML
interface RunDetail {
  label: string
  html: string
}

/**
 * Renders the header section of the report.
 */
export function renderHeader(result: ReviewResult): string {
  const { metadata, findings } = result

  // build the three parts of the header
  const runDetailsHtml = renderRunDetails(metadata)
  const introducedFindings = findings.filter(
    (finding) => finding.isIntroducedByPullRequest,
  )
  const countsHtml = renderCounts(introducedFindings)
  const originLine = renderOriginLine(findings)

  return [
    '<header>',
    '<h1>Pull request security review</h1>',
    runDetailsHtml,
    countsHtml,
    originLine,
    '</header>',
  ].join('\n')
}

// render the run metadata as a definition list
function renderRunDetails(metadata: ReviewMetadata): string {
  const details: RunDetail[] = [
    {
      label: 'Ran at',
      html: `<time datetime="${escapeHtml(metadata.startedAt)}">${escapeHtml(metadata.startedAt)}</time>`,
    },
    { label: 'Pull request', html: renderPullRequest(metadata) },
    { label: 'Base sha', html: renderCode(metadata.baseSha) },
    { label: 'Head sha', html: renderCode(metadata.headSha) },
    { label: 'Run id', html: renderCode(metadata.runId) },
    { label: 'Duration', html: formatDuration(metadata) },
    { label: 'Total cost', html: formatCostUsd(metadata.totalCostUsd) },
    { label: 'Advisory snapshot', html: renderSnapshotDate(metadata) },
    {
      label: 'Prompts',
      html: renderRecord(metadata.promptVersions, formatPrompt),
    },
    { label: 'Models', html: renderRecord(metadata.modelIds, formatModel) },
    {
      label: 'Suspected prompt injections',
      html: String(metadata.suspectedPromptInjectionCount),
    },
  ]
  const detailHtml = details.map(
    ({ label, html }) => `<dt>${label}</dt><dd>${html}</dd>`,
  )
  return `<dl class="run-details">${detailHtml.join('')}</dl>`
}

// link the pull request by owner, repository and number. the contract has no title
function renderPullRequest(metadata: ReviewMetadata): string {
  const { pullRequestReference } = metadata
  if (pullRequestReference === undefined) {
    return emptyValueText
  }
  const { owner, repository, number, url } = pullRequestReference
  return renderLink({ url, label: `${owner}/${repository}#${number}` })
}

// show the date the advisory snapshot was fetched
function renderSnapshotDate(metadata: ReviewMetadata): string {
  if (metadata.advisorySnapshot === undefined) {
    return emptyValueText
  }
  const fetchedDate = metadata.advisorySnapshot.fetchedAt.slice(0, 10)
  return escapeHtml(fetchedDate)
}

// wrap a value in a code element
function renderCode(text: string): string {
  return `<code>${escapeHtml(text)}</code>`
}

// render a record as comma separated entries, or the empty marker when it has none
function renderRecord(
  record: Record<string, string>,
  formatEntry: (key: string, value: string) => string,
): string {
  const entries = Object.entries(record)
  if (entries.length === 0) {
    return emptyValueText
  }
  const formattedEntries = entries.map(([key, value]) =>
    escapeHtml(formatEntry(key, value)),
  )
  return formattedEntries.join(', ')
}

// show a prompt id with its version
function formatPrompt(promptId: string, version: string): string {
  return `${promptId} v${version}`
}

// show the step a model ran for with its model id
function formatModel(stepName: string, modelId: string): string {
  return `${stepName}: ${modelId}`
}

// render the count of introduced findings per severity and per detector
function renderCounts(introducedFindings: Finding[]): string {
  // count the findings for each severity and each detector
  const severityItems = severities.map((severity) =>
    renderCountItem({
      attributeName: 'severity',
      value: severity,
      count: introducedFindings.filter(
        (finding) => finding.severity === severity,
      ).length,
    }),
  )
  const detectorItems = detectorKinds.map((detector) =>
    renderCountItem({
      attributeName: 'detector',
      value: detector,
      count: introducedFindings.filter(
        (finding) => finding.detector === detector,
      ).length,
    }),
  )

  // lay the two lists side by side
  return [
    '<div class="counts">',
    `<ul aria-label="Introduced findings by severity">${severityItems.join('')}</ul>`,
    `<ul aria-label="Introduced findings by detector">${detectorItems.join('')}</ul>`,
    '</div>',
  ].join('')
}

// the attribute, value and count of one count item
interface RenderCountItemOptions {
  attributeName: 'severity' | 'detector'
  value: string
  count: number
}

// render one count with its value as a data attribute so a test or a script can read it
function renderCountItem({
  attributeName,
  value,
  count,
}: RenderCountItemOptions): string {
  return `<li class="${attributeName}-${value}" data-${attributeName}="${value}" data-count="${count}"><strong>${count}</strong> ${value}</li>`
}

// say how many findings were already there and how many the pull request introduced
function renderOriginLine(findings: Finding[]): string {
  const introducedCount = findings.filter(
    (finding) => finding.isIntroducedByPullRequest,
  ).length
  const preExistingCount = findings.length - introducedCount
  return `<p class="origin-line">${preExistingCount} pre-existing, ${introducedCount} introduced by this pull request. Counts above include introduced findings only.</p>`
}
