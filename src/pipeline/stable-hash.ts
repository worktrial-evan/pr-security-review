// hashes any value to a sha256 hex digest that does not depend on object key order. maps and sets are included

/**
 * Returns the sha256 hex digest of a value's stable JSON form.
 */
export function hashValue(value: unknown): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(toStableJson(value))
  return hasher.digest('hex')
}

/**
 * Returns JSON for a value with object keys sorted, a Map as its entries and a Set as its values.
 */
export function toStableJson(value: unknown): string {
  return JSON.stringify(toStableValue(value)) ?? 'null'
}

// rebuild a value as plain JSON data with sorted keys. functions and undefined are left out
function toStableValue(value: unknown): unknown {
  // turn maps and sets into arrays in their iteration order
  if (value instanceof Map) {
    return [...value.entries()].map(([key, entryValue]) => [
      toStableValue(key),
      toStableValue(entryValue),
    ])
  }
  if (value instanceof Set) {
    return [...value].map(toStableValue)
  }

  // walk arrays item by item
  if (Array.isArray(value)) {
    return value.map(toStableValue)
  }

  // sort the keys of plain objects and drop what JSON cannot hold
  if (typeof value === 'object' && value !== null) {
    const sortedEntries = Object.entries(value)
      .filter(([, entryValue]) => isJsonValue(entryValue))
      .sort(([firstKey], [secondKey]) => (firstKey < secondKey ? -1 : 1))
    return Object.fromEntries(
      sortedEntries.map(([key, entryValue]) => [
        key,
        toStableValue(entryValue),
      ]),
    )
  }
  return value
}

// whether a value survives JSON serialization as an object member
function isJsonValue(value: unknown): boolean {
  return value !== undefined && typeof value !== 'function'
}
