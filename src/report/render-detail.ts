// renders the expanded detail of one finding and the advisory links shared with the table
import type { Finding, ScaFinding } from '../shared/finding'
import { escapeHtml, renderLink } from './html-escape'
import { emptyValueText } from './report-format'

// where an advisory id or alias is looked up
const advisoryUrlPrefix = 'https://osv.dev/vulnerability/'

/**
 * Renders the advisory id and each alias as a link to its advisory page.
 */
export function renderAdvisoryLinks(finding: ScaFinding): string {
  const advisoryIds = [finding.advisoryId, ...finding.aliases]
  const links = advisoryIds.map((advisoryId) =>
    renderLink({ url: `${advisoryUrlPrefix}${advisoryId}`, label: advisoryId }),
  )
  return links.join(' ')
}

/**
 * Renders the summary, remediation, evidence, dependency path, importing files and advisory links of a finding.
 */
export function renderDetail(finding: Finding): string {
  // read the parts that depend on the detector
  const evidenceHtml = renderEvidence(finding)
  const dependencyPathHtml = renderDependencyPath(finding)
  const importedByHtml = renderImportedBy(finding)
  const advisoryHtml = renderAdvisoryReferences(finding)

  // lay the parts out as labelled entries
  const entries = [
    { label: 'Summary', html: renderText(finding.summary) },
    { label: 'Remediation', html: renderText(finding.remediation) },
    { label: 'Evidence', html: evidenceHtml },
    { label: 'Dependency path', html: dependencyPathHtml },
    { label: 'Imported by', html: importedByHtml },
    { label: 'Advisory references', html: advisoryHtml },
  ]
  const entryHtml = entries.map(
    ({ label, html }) => `<dt>${label}</dt><dd>${html}</dd>`,
  )
  return `<dl class="detail-list">${entryHtml.join('')}</dl>`
}

// render optional text, or the empty marker
function renderText(text: string | undefined): string {
  if (text === undefined || text === '') {
    return emptyValueText
  }
  return escapeHtml(text)
}

// render the evidence lines of a code review finding
function renderEvidence(finding: Finding): string {
  if (finding.detector !== 'code-review' || finding.evidence.length === 0) {
    return emptyValueText
  }
  const lines = finding.evidence.map(
    (evidenceLine) => `<li><code>${escapeHtml(evidenceLine)}</code></li>`,
  )
  return `<ol class="evidence">${lines.join('')}</ol>`
}

// render the chain of packages from a direct dependency to the vulnerable one
function renderDependencyPath(finding: Finding): string {
  if (finding.detector !== 'sca' || finding.dependencyPath.length === 0) {
    return emptyValueText
  }
  const packages = finding.dependencyPath.map(
    (dependencyKey) => `<code>${escapeHtml(dependencyKey)}</code>`,
  )
  return packages.join(' &gt; ')
}

// render the files that import the vulnerable package
function renderImportedBy(finding: Finding): string {
  if (finding.detector !== 'sca' || finding.importedBy.length === 0) {
    return emptyValueText
  }
  const files = finding.importedBy.map(
    (filePath) => `<li><code>${escapeHtml(filePath)}</code></li>`,
  )
  return `<ul>${files.join('')}</ul>`
}

// render the advisory links and the versions that fix the advisory
function renderAdvisoryReferences(finding: Finding): string {
  if (finding.detector !== 'sca') {
    return emptyValueText
  }
  if (finding.fixedVersions.length === 0) {
    return renderAdvisoryLinks(finding)
  }
  const fixedVersions = escapeHtml(finding.fixedVersions.join(', '))
  return `${renderAdvisoryLinks(finding)}<br>Fixed in ${fixedVersions}`
}
