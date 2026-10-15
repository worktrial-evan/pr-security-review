// redirects to a path inside the app and refuses any target that leaves it

/**
 * Returns a redirect to the target when it is a relative path, else a 400.
 */
export function redirectWithinApp(target: string): Response {
  // accept only a path that starts with a single slash
  const isRelativePath =
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.startsWith('/\\')
  if (!isRelativePath) {
    return new Response('Bad redirect target', { status: 400 })
  }

  return Response.redirect(target, 302)
}
