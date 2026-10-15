// checks the redirect guard and the public file download against hostile targets
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPublicFile } from './downloads'
import { redirectWithinApp } from './redirects'

describe('redirectWithinApp', () => {
  test('redirects to a path inside the app', () => {
    const response = redirectWithinApp('/users/1')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/users/1')
  })

  test('refuses a protocol-relative target', () => {
    expect(redirectWithinApp('//evil.example').status).toBe(400)
  })

  test('refuses an absolute url', () => {
    expect(redirectWithinApp('https://evil.example').status).toBe(400)
  })
})

describe('readPublicFile', () => {
  // a temporary public directory holding one file
  let publicDirectory = ''
  beforeEach(async () => {
    publicDirectory = mkdtempSync(join(tmpdir(), 'fixture-public-'))
    await Bun.write(join(publicDirectory, 'hello.txt'), 'hello')
  })
  afterEach(() => {
    rmSync(publicDirectory, { recursive: true, force: true })
  })

  test('serves a file inside the public directory', async () => {
    const response = await readPublicFile({
      publicDirectory,
      requestedPath: 'hello.txt',
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
  })

  test('refuses a path that escapes the public directory', async () => {
    const response = await readPublicFile({
      publicDirectory,
      requestedPath: '../package.json',
    })
    expect(response.status).toBe(403)
  })

  test('reports a missing file', async () => {
    const response = await readPublicFile({
      publicDirectory,
      requestedPath: 'missing.txt',
    })
    expect(response.status).toBe(404)
  })
})
