// checks that every opened HTML tag is closed in order, as a well-formedness check for the tests

// the elements that never have a closing tag
const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

// the elements whose content is text, not markup
const rawTextElements = new Set(['script', 'style'])

// a comment, or an opening or closing tag with quoted attribute values that may contain a greater-than sign
const tagPattern =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g

/**
 * Returns a description of the first tag problem in the HTML, or null when every tag is closed in order.
 */
export function findTagImbalance(html: string): string | null {
  const openTagNames: string[] = []

  // walk every tag in the document
  tagPattern.lastIndex = 0
  let match = tagPattern.exec(html)
  while (match !== null) {
    const [tagText, closingSlash, rawTagName, attributeText] = match
    const tagName = (rawTagName ?? '').toLowerCase()

    // skip comments
    if (tagName === '') {
      match = tagPattern.exec(html)
      continue
    }

    // match a closing tag with the innermost open tag
    if (closingSlash === '/') {
      const expectedTagName = openTagNames.pop()
      if (expectedTagName !== tagName) {
        return `unexpected closing tag </${tagName}>, expected </${expectedTagName ?? 'nothing'}>`
      }
      match = tagPattern.exec(html)
      continue
    }

    // open a tag unless it never has content
    const isSelfClosed = (attributeText ?? '').trimEnd().endsWith('/')
    if (!voidElements.has(tagName) && !isSelfClosed) {
      openTagNames.push(tagName)
    }

    // jump over the text content of a script or style element
    if (rawTextElements.has(tagName)) {
      tagPattern.lastIndex = skipRawText(
        html,
        tagName,
        match.index + tagText.length,
      )
    }
    match = tagPattern.exec(html)
  }

  // report the innermost tag left open
  const unclosedTagName = openTagNames.pop()
  if (unclosedTagName !== undefined) {
    return `unclosed tag <${unclosedTagName}>`
  }
  return null
}

// find where the closing tag of a raw text element starts, or the end of the html when it is missing
function skipRawText(html: string, tagName: string, fromIndex: number): number {
  const closingIndex = html.toLowerCase().indexOf(`</${tagName}`, fromIndex)
  return closingIndex === -1 ? html.length : closingIndex
}
