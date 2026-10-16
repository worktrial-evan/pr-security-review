// the one code unit string comparator. the order never depends on the locale

// the two strings to compare
export interface CompareStringsOptions {
  first: string
  second: string
}

/**
 * Compares two strings by code unit order and returns -1, 0 or 1.
 */
export function compareStrings({
  first,
  second,
}: CompareStringsOptions): number {
  if (first === second) {
    return 0
  }
  return first < second ? -1 : 1
}
