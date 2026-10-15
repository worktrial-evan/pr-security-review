// replaces every secret-like string in a value with a sha256 fingerprint, returning a deep copy and leaving the input untouched

// the key names whose values are secrets, whatever the value looks like
const secretKeyPattern =
  /token|secret|password|passwd|api[-_]?key|authorization|credential/i

// the token shapes a string is a secret by, each one anchored at the start of the string
const tokenShapePatterns: readonly RegExp[] = [
  /^ghp_/,
  /^gho_/,
  /^github_pat_/,
  /^sk-ant-/,
  /^sk-/,
  /^AKIA[A-Z0-9]{16}\b/,
  /^xoxb-/,
  /^xoxp-/,
  /^xoxa-/,
  /^Bearer \S+/i,
]

// the fingerprint prefix and the number of hex characters kept after it
const fingerprintPrefix = 'sha256:'
const fingerprintHexLength = 16

/**
 * Returns a deep copy of a value with every secret-like string replaced by a sha256 fingerprint.
 */
export function redact<T>(value: T): T {
  const redactedValue = redactValue({ value, isUnderSecretKey: false })
  return redactedValue as T
}

// one value of the walk and whether a secret key sits on the path above it
interface RedactValueOptions {
  value: unknown
  isUnderSecretKey: boolean
}

// copy one value, fingerprinting the strings that are secrets by key or by shape
function redactValue({ value, isUnderSecretKey }: RedactValueOptions): unknown {
  // fingerprint a string that is a secret
  if (typeof value === 'string') {
    const isSecret = isUnderSecretKey || hasTokenShape(value)
    return isSecret ? fingerprint(value) : value
  }

  // copy an array element by element
  if (Array.isArray(value)) {
    return value.map((element) =>
      redactValue({ value: element, isUnderSecretKey }),
    )
  }

  // copy an object entry by entry. a secret key covers everything below it
  if (typeof value === 'object' && value !== null) {
    const redactedEntries = Object.entries(value).map(([key, entryValue]) => {
      const isEntryUnderSecretKey =
        isUnderSecretKey || secretKeyPattern.test(key)
      return [
        key,
        redactValue({
          value: entryValue,
          isUnderSecretKey: isEntryUnderSecretKey,
        }),
      ]
    })
    return Object.fromEntries(redactedEntries)
  }

  // pass numbers, booleans, null and undefined through
  return value
}

// tell whether a string looks like a token
function hasTokenShape(text: string): boolean {
  return tokenShapePatterns.some((tokenShapePattern) =>
    tokenShapePattern.test(text),
  )
}

// replace a secret with the leading hex of its sha256 digest
function fingerprint(secret: string): string {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(secret)
  const digestHex = hasher.digest('hex')
  return `${fingerprintPrefix}${digestHex.slice(0, fingerprintHexLength)}`
}
