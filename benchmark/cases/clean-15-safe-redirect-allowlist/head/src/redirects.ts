// redirects to one of the named pages inside the app and refuses any other target

// the pages a redirect may lead to, by the name the query string gives
const redirectTargets = new Map<string, string>([
  ['home', '/'],
  ['login', '/login'],
  ['admin', '/admin'],
  ['health', '/health'],
])

/**
 * Returns a redirect to the page the name maps to, else a 400.
 */
export function redirectWithinApp(targetName: string): Response {
  // look the name up in the allowlist
  const target = redirectTargets.get(targetName)
  if (target === undefined) {
    return new Response('Unknown redirect target', { status: 400 })
  }

  return Response.redirect(target, 302)
}
