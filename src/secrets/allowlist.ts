// the checks that skip credential matches: placeholder values, fixture and example env files, marked lines, and the entropy measure the generic rule uses

// words that mark a value as a placeholder, in any letter case
const placeholderValuePattern = /example|xxxx|<|placeholder|changeme/i

// a path with a fixtures directory anywhere in it
const fixtureFilePattern = /(^|\/)fixtures\//

// an example env file such as .env.example, .env.sample or .env.template
const exampleEnvFilePattern = /(^|\/)\.env\.[^/]*(example|sample|template)$/i

// a trailing comment that marks the line as reviewed: // secrets-allow, # secrets-allow and so on
const allowCommentPattern =
  /(?:\/\/|#|--|\/\*|<!--)\s*secrets-allow\s*(?:\*\/|-->)?\s*$/

/** Tells whether a matched value looks like a placeholder. */
export function isAllowlistedValue(value: string): boolean {
  return placeholderValuePattern.test(value)
}

/** Tells whether a file path is a test fixture or an example env file. */
export function isAllowlistedFile(path: string): boolean {
  if (fixtureFilePattern.test(path)) {
    return true
  }
  return exampleEnvFilePattern.test(path)
}

/** Tells whether a line ends in a secrets-allow comment. */
export function isAllowlistedLine(text: string): boolean {
  return allowCommentPattern.test(text)
}

/** Measures the Shannon entropy of a string in bits per character. */
export function calculateShannonEntropy(value: string): number {
  // count how often each character appears
  const characters = [...value]
  const characterCounts = new Map<string, number>()
  for (const character of characters) {
    const characterCount = characterCounts.get(character) ?? 0
    characterCounts.set(character, characterCount + 1)
  }

  // sum the information each character carries
  let entropy = 0
  for (const characterCount of characterCounts.values()) {
    const probability = characterCount / characters.length
    entropy -= probability * Math.log2(probability)
  }

  return entropy
}
