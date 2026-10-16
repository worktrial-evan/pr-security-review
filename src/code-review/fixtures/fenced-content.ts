// reads the content back out of an untrusted fence

// the fenced text and the two tags that enclose its content
export interface ReadFencedContentOptions {
  text: string
  openTag: string
  closeTag: string
}

/**
 * Returns the content between the open tag plus a newline and a newline plus the close tag, and throws when either tag is missing or no line lies between them.
 */
export function readFencedContent({
  text,
  openTag,
  closeTag,
}: ReadFencedContentOptions): string {
  // reject a text that does not start with the open tag on its own line
  const openTagLine = `${openTag}\n`
  if (!text.startsWith(openTagLine)) {
    throw new Error(`fenced text does not start with ${openTag}`)
  }

  // reject a text that does not end with the close tag on its own line
  const closeTagLine = `\n${closeTag}`
  if (!text.endsWith(closeTagLine)) {
    throw new Error(`fenced text does not end with ${closeTag}`)
  }

  // reject a text too short to hold a line between the two tag lines
  if (text.length < openTagLine.length + closeTagLine.length) {
    throw new Error(
      `fenced text has no line between ${openTag} and ${closeTag}`,
    )
  }

  return text.slice(openTagLine.length, text.length - closeTagLine.length)
}
