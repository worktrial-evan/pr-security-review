// stores uploaded files under the uploads directory with a generated name
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'

// the storage of one uploaded file
export interface StoreUploadOptions {
  uploadsDirectory: string
  file: File
}

// the file extensions the app keeps
const allowedExtensions = new Set(['.png', '.jpg', '.txt'])

/**
 * Writes the uploaded file under a generated name and returns that name, or null when the extension is not allowed.
 */
export async function storeUpload({
  uploadsDirectory,
  file,
}: StoreUploadOptions): Promise<string | null> {
  // keep only the allowed extensions
  const extension = extname(file.name).toLowerCase()
  if (!allowedExtensions.has(extension)) {
    return null
  }

  // write under a random name, never the client's name
  const storedName = `${randomUUID()}${extension}`
  await Bun.write(join(uploadsDirectory, storedName), file)

  return storedName
}
