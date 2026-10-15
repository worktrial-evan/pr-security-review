// formats the values the report shows: the empty marker, cost, duration and confidence

// the text shown where a value does not apply or is missing
export const emptyValueText = '–'

// the two timestamps a duration runs between
export interface FormatDurationOptions {
  startedAt: string
  finishedAt: string
}

/**
 * Formats a cost in US dollars with four decimals.
 */
export function formatCostUsd(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`
}

/**
 * Formats the time between two ISO timestamps as minutes and seconds, or seconds alone under a minute.
 */
export function formatDuration({
  startedAt,
  finishedAt,
}: FormatDurationOptions): string {
  // find the whole seconds between the timestamps
  const elapsedMilliseconds = Date.parse(finishedAt) - Date.parse(startedAt)
  if (Number.isNaN(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    return emptyValueText
  }
  const elapsedSeconds = Math.round(elapsedMilliseconds / 1000)

  // show minutes only when there is at least one
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds}s`
}

/**
 * Formats a confidence between 0 and 1 as a whole percent.
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}
