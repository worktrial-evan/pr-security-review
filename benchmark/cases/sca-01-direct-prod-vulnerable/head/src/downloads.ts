// serves files from the public directory and refuses any path that escapes it
import { sep as pathSeparator, resolve } from 'node:path'

// the download of one public file
export interface ReadPublicFileOptions {
  publicDirectory: string
  requestedPath: string
}

/**
 * Returns the public file at the requested path, 403 when the path escapes the directory, 404 when it is missing.
 */
export async function readPublicFile({
  publicDirectory,
  requestedPath,
}: ReadPublicFileOptions): Promise<Response> {
  // resolve the requested path against the public root
  const publicRoot = resolve(publicDirectory)
  const filePath = resolve(publicRoot, requestedPath)

  // refuse a path that resolves outside the public root
  if (!filePath.startsWith(publicRoot + pathSeparator)) {
    return new Response('Forbidden', { status: 403 })
  }

  // refuse a path that names no file
  const publicFile = Bun.file(filePath)
  const isFilePresent = await publicFile.exists()
  if (!isFilePresent) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(publicFile)
}
