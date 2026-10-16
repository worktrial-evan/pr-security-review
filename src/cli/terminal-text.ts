// makes text safe to print to a terminal by removing control characters other than newline and tab

/**
 * Returns the text without control characters, keeping newlines and tabs.
 */
export function toTerminalText(text: string): string {
  const keptCharacters = Array.from(text).filter(
    (character) => !isControlCharacter(character),
  )
  return keptCharacters.join('')
}

// whether a character is a control character. that is C0 other than tab and newline. it is also delete and the C1 range
function isControlCharacter(character: string): boolean {
  if (character === '\n' || character === '\t') {
    return false
  }
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

// where the cli writes its output
export interface CliOutput {
  writeOut(text: string): void
  writeErr(text: string): void
}

/**
 * Creates an output that writes sanitized text to stdout and stderr.
 */
export function createProcessOutput(): CliOutput {
  return {
    writeOut(text) {
      process.stdout.write(toTerminalText(text))
    },
    writeErr(text) {
      process.stderr.write(toTerminalText(text))
    },
  }
}
