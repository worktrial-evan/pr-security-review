// escapes text for HTML and builds links that are only live for https urls

// the characters that can end or open markup, and what each becomes
const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// the schemes a link may use
const linkableUrlPattern = /^https:\/\//

// the url and visible text of one link
export interface RenderLinkOptions {
  url: string
  label: string
}

/**
 * Escapes the characters that could open or close markup in text or an attribute value.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? '')
}

/**
 * Renders an anchor for an https url and plain escaped text for any other url.
 */
export function renderLink({ url, label }: RenderLinkOptions): string {
  // show the label as text when the url is not https
  const escapedLabel = escapeHtml(label)
  if (!linkableUrlPattern.test(url)) {
    return escapedLabel
  }

  // link out without sending the referrer
  const escapedUrl = escapeHtml(url)
  return `<a href="${escapedUrl}" rel="noreferrer">${escapedLabel}</a>`
}
