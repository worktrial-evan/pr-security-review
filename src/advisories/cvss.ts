// computes the CVSS 3.x base score from a CVSS 3.x vector string

// the weight of each base metric value, from the CVSS 3.1 specification
const attackVectorWeights: Record<string, number> = {
  N: 0.85,
  A: 0.62,
  L: 0.55,
  P: 0.2,
}
const attackComplexityWeights: Record<string, number> = { L: 0.77, H: 0.44 }
const userInteractionWeights: Record<string, number> = { N: 0.85, R: 0.62 }
const impactWeights: Record<string, number> = { H: 0.56, L: 0.22, N: 0 }

// privileges required weigh more when the scope changes
const privilegesRequiredWeights: Record<string, number> = {
  N: 0.85,
  L: 0.62,
  H: 0.27,
}
const changedScopePrivilegesRequiredWeights: Record<string, number> = {
  N: 0.85,
  L: 0.68,
  H: 0.5,
}

// the base metrics a vector must hold, in the order the specification lists them
const baseMetricNames = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const

/**
 * Returns the CVSS 3.x base score of a vector, or undefined when the vector is not a valid CVSS 3.x vector.
 */
export function computeCvss3BaseScore(vector: string): number | undefined {
  // read the base metrics out of the vector
  const baseMetrics = readCvss3BaseMetrics(vector)
  if (baseMetrics === undefined) {
    return undefined
  }

  // look up the weight of every metric
  const isScopeChanged = baseMetrics.S === 'C'
  const privilegesRequiredTable = isScopeChanged
    ? changedScopePrivilegesRequiredWeights
    : privilegesRequiredWeights
  const attackVector = attackVectorWeights[baseMetrics.AV]
  const attackComplexity = attackComplexityWeights[baseMetrics.AC]
  const privilegesRequired = privilegesRequiredTable[baseMetrics.PR]
  const userInteraction = userInteractionWeights[baseMetrics.UI]
  const confidentiality = impactWeights[baseMetrics.C]
  const integrity = impactWeights[baseMetrics.I]
  const availability = impactWeights[baseMetrics.A]
  if (
    attackVector === undefined ||
    attackComplexity === undefined ||
    privilegesRequired === undefined ||
    userInteraction === undefined ||
    confidentiality === undefined ||
    integrity === undefined ||
    availability === undefined
  ) {
    return undefined
  }

  // combine the confidentiality, integrity and availability weights into the impact sub score
  const impactSubScore =
    1 - (1 - confidentiality) * (1 - integrity) * (1 - availability)
  const impact = isScopeChanged
    ? 7.52 * (impactSubScore - 0.029) - 3.25 * (impactSubScore - 0.02) ** 15
    : 6.42 * impactSubScore
  const exploitability =
    8.22 *
    attackVector *
    attackComplexity *
    privilegesRequired *
    userInteraction

  // a vector with no impact scores zero
  if (impact <= 0) {
    return 0
  }

  // add impact and exploitability, capped at 10 and rounded up to one decimal
  const uncappedScore = isScopeChanged
    ? 1.08 * (impact + exploitability)
    : impact + exploitability
  return roundUpToOneDecimal(Math.min(uncappedScore, 10))
}

// the base metric values of one vector, keyed by metric name
type Cvss3BaseMetrics = Record<(typeof baseMetricNames)[number], string>

// split a CVSS 3.x vector into its base metrics. any missing base metric makes the vector invalid
function readCvss3BaseMetrics(vector: string): Cvss3BaseMetrics | undefined {
  // reject anything that is not a CVSS 3.0 or 3.1 vector
  const [versionPart, ...metricParts] = vector.split('/')
  if (versionPart !== 'CVSS:3.0' && versionPart !== 'CVSS:3.1') {
    return undefined
  }

  // collect every metric as a name and value pair
  const metricValues = new Map<string, string>()
  for (const metricPart of metricParts) {
    const [metricName, metricValue] = metricPart.split(':')
    if (metricName === undefined || metricValue === undefined) {
      return undefined
    }
    metricValues.set(metricName, metricValue)
  }

  // keep the base metrics and require every one of them
  const baseMetrics: Partial<Cvss3BaseMetrics> = {}
  for (const baseMetricName of baseMetricNames) {
    const metricValue = metricValues.get(baseMetricName)
    if (metricValue === undefined) {
      return undefined
    }
    baseMetrics[baseMetricName] = metricValue
  }
  return baseMetrics as Cvss3BaseMetrics
}

// round up to one decimal the way CVSS 3.1 does, which avoids floating point artifacts such as 4.000001 becoming 4.1
function roundUpToOneDecimal(score: number): number {
  const scaledScore = Math.round(score * 100000)
  if (scaledScore % 10000 === 0) {
    return scaledScore / 100000
  }
  return (Math.floor(scaledScore / 10000) + 1) / 10
}
