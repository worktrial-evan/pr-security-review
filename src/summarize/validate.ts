// checks a model summary against the versions, advisory ids, package names and urls its packet holds
import { normalizePackageName } from '@/shared/package-name'

// the identifiers a summary may name, each normalized the way the extractors normalize them
export interface SummaryGrounding {
  versions: ReadonlySet<string>
  advisoryIds: ReadonlySet<string>
  packageNames: ReadonlySet<string>
  urls: ReadonlySet<string>
}

// the text the model wrote for one finding
export interface ModelSummary {
  summary: string
  remediation: string
}

export interface ValidateSummaryOptions {
  modelSummary: ModelSummary | undefined
  grounding: SummaryGrounding
}

// a url, ending before whitespace, quotes, brackets and angle brackets
const urlPattern = /https?:\/\/[^\s<>"'`()[\]]+/g

// punctuation that ends a sentence after a url instead of belonging to it
const urlTrailingPunctuationPattern = /[.,;:!?]+$/

// a semver-looking version with an optional leading v, a prerelease and build metadata
const versionPattern =
  /(?<![\w.])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?)(?!\w|\.\d)/g

// advisory ids: CVE, GHSA in any case, and the OSV form PREFIX-YEAR-ID such as PYSEC-2021-1
const advisoryIdPatterns = [
  /\bCVE-\d{4}-\d{4,}\b/gi,
  /\bGHSA(?:-[0-9a-z]{4}){3}\b/gi,
  /\b[A-Z][A-Z0-9]*-\d{4}-[A-Za-z0-9]+\b/g,
]

// package mentions: a scoped name not ending in punctuation, or the name in name@version
const packageNamePatterns = [
  /(?<![\w./-])(@[a-z0-9][\w.-]*\/[a-z0-9](?:[\w.-]*\w)?)/gi,
  /(?<![\w@./-])([a-z0-9][\w.-]*)@v?\d+\.\d+\.\d+/gi,
]

/**
 * Returns one violation per identifier in a model summary that its grounding does not hold.
 */
export function validateSummary({
  modelSummary,
  grounding,
}: ValidateSummaryOptions): string[] {
  // reject a missing or empty summary
  if (!modelSummary) {
    return ['no summary was returned for this finding']
  }
  if (!modelSummary.summary.trim() || !modelSummary.remediation.trim()) {
    return ['the summary or the remediation is empty']
  }

  // check urls first, then the text with the urls removed
  const text = `${modelSummary.summary}\n${modelSummary.remediation}`
  const urls = extractUrls(text)
  const textWithoutUrls = text.replace(urlPattern, ' ')

  // collect a violation for every identifier outside the grounding
  const violations: string[] = []
  for (const url of urls) {
    if (!grounding.urls.has(url)) {
      violations.push(`url ${url} is not one of the advisory references`)
    }
  }
  for (const version of extractVersions(textWithoutUrls)) {
    if (!grounding.versions.has(version)) {
      violations.push(`version ${version} is not in the input`)
    }
  }
  for (const advisoryId of extractAdvisoryIds(textWithoutUrls)) {
    if (!grounding.advisoryIds.has(advisoryId)) {
      violations.push(`advisory id ${advisoryId} is not in the input`)
    }
  }
  for (const packageName of extractPackageNames(textWithoutUrls)) {
    if (!grounding.packageNames.has(packageName)) {
      violations.push(
        `package ${packageName} is not the finding's package or on its dependency path`,
      )
    }
  }
  return violations
}

/**
 * Returns the distinct urls in a text, without trailing sentence punctuation.
 */
export function extractUrls(text: string): Set<string> {
  const urlMatches = text.match(urlPattern) ?? []
  const urls = urlMatches.map((url) =>
    url.replace(urlTrailingPunctuationPattern, ''),
  )
  return new Set(urls)
}

/**
 * Returns the distinct semver-looking versions in a text, without a leading v.
 */
export function extractVersions(text: string): Set<string> {
  const versionMatches = text.matchAll(versionPattern)
  const versions = [...versionMatches].map((versionMatch) => versionMatch[1])
  return new Set(versions.filter((version) => version !== undefined))
}

/**
 * Returns the distinct advisory ids in a text, uppercased.
 */
export function extractAdvisoryIds(text: string): Set<string> {
  const advisoryIds = new Set<string>()
  for (const advisoryIdPattern of advisoryIdPatterns) {
    for (const advisoryIdMatch of text.matchAll(advisoryIdPattern)) {
      advisoryIds.add(advisoryIdMatch[0].toUpperCase())
    }
  }
  return advisoryIds
}

/**
 * Returns the distinct package names a text mentions, normalized.
 */
export function extractPackageNames(text: string): Set<string> {
  const packageNames = new Set<string>()
  for (const packageNamePattern of packageNamePatterns) {
    for (const packageNameMatch of text.matchAll(packageNamePattern)) {
      const packageName = packageNameMatch[1]
      if (packageName) {
        packageNames.add(normalizePackageName(packageName))
      }
    }
  }
  return packageNames
}
