// starts the fixture web app: users, login, admin, download, redirect, upload and health routes on Bun.serve
import { signSessionToken, verifySessionToken } from './auth'
import { loadConfig } from './config'
import { readPublicFile } from './downloads'
import { redirectWithinApp } from './redirects'
import { readSystemName } from './shell'
import { renderProfilePage } from './templates'
import { storeUpload } from './uploads'
import { findUserByCredentials, findUserById, openUserDatabase } from './users'

// load the configuration and open the database once
const config = loadConfig()
const database = openUserDatabase(config.databasePath)

// the preferences each user has saved, keyed by user id
const preferencesByUserId: Record<string, Record<string, unknown>> = {}

// copy every key of the source onto the target, descending into nested objects
function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    if (typeof sourceValue === 'object' && sourceValue !== null) {
      const nestedTarget = (target[key] ?? {}) as Record<string, unknown>
      target[key] = mergeDeep(
        nestedTarget,
        sourceValue as Record<string, unknown>,
      )
      continue
    }
    target[key] = sourceValue
  }
  return target
}

// serve every route
const server = Bun.serve({
  port: config.port,
  routes: {
    '/users/:id': (request) => {
      // read one user by id
      const user = findUserById(database, Number(request.params.id))
      if (user === null) {
        return new Response('Not found', { status: 404 })
      }
      return Response.json(user)
    },
    '/users/:id/profile': (request) => {
      // render the profile page for one user
      const user = findUserById(database, Number(request.params.id))
      if (user === null) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(renderProfilePage(user), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    },
    '/login': {
      POST: async (request) => {
        // check the credentials and issue a token
        const loginBody = (await request.json()) as {
          name: string
          password: string
        }
        const user = await findUserByCredentials({
          database,
          name: String(loginBody.name),
          password: String(loginBody.password),
        })
        if (user === null) {
          return new Response('Unauthorized', { status: 401 })
        }
        const token = signSessionToken(
          { userId: user.id, role: user.role },
          config.jwtSecret,
        )
        return Response.json({ token })
      },
    },
    '/users/:id/preferences': {
      POST: async (request) => {
        // merge the submitted preferences over the saved ones
        const submittedPreferences = (await request.json()) as Record<
          string,
          unknown
        >
        const savedPreferences = preferencesByUserId[request.params.id] ?? {}
        preferencesByUserId[request.params.id] = mergeDeep(
          savedPreferences,
          submittedPreferences,
        )
        return Response.json(preferencesByUserId[request.params.id])
      },
    },
    '/admin': (request) => {
      // allow only a verified token with the admin role
      const claims = verifySessionToken(request, config.jwtSecret)
      if (claims === null) {
        return new Response('Unauthorized', { status: 401 })
      }
      if (claims.role !== 'admin') {
        return new Response('Forbidden', { status: 403 })
      }
      return Response.json({ message: `welcome, admin ${claims.userId}` })
    },
    '/download': (request) => {
      // serve one file from the public directory
      const requestedPath = new URL(request.url).searchParams.get('file') ?? ''
      return readPublicFile({
        publicDirectory: config.publicDirectory,
        requestedPath,
      })
    },
    '/redirect': (request) => {
      // send the client to a path inside the app
      const target = new URL(request.url).searchParams.get('to') ?? '/'
      return redirectWithinApp(target)
    },
    '/upload': {
      POST: async (request) => {
        // store the uploaded file under a generated name
        const formData = await request.formData()
        const file = formData.get('file')
        if (!(file instanceof File)) {
          return new Response('Bad request', { status: 400 })
        }
        const storedName = await storeUpload({
          uploadsDirectory: config.uploadsDirectory,
          file,
        })
        if (storedName === null) {
          return new Response('Unsupported file type', { status: 415 })
        }
        return Response.json({ storedName })
      },
    },
    '/health': async () => {
      // report the host system name
      const systemName = await readSystemName()
      return Response.json({ status: 'ok', systemName })
    },
  },
})

// say where the app listens
console.log(`benchmark fixture app listening on ${server.url}`)
