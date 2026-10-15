// redirects to a path inside the app and refuses any target that leaves it

/**
 * Returns a redirect to the target when it is a relative path or an absolute url, else a 400.
 */
export function redirectWithinApp(target: string): Response {
  // also accept an absolute url as the target
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return Response.redirect(target, 302)
  }

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
