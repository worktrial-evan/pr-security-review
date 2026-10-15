// tests the specifier mapping: bare, subpath and scoped packages kept, builtins, relative and alias paths dropped

import { describe, expect, test } from 'bun:test'
import { toPackageName } from './package-specifier'

describe('toPackageName', () => {
  test.each([
    ['lodash', 'lodash'],
    ['lodash/merge', 'lodash'],
    ['lodash/fp/merge.js', 'lodash'],
    ['@acme/logger', '@acme/logger'],
    ['@acme/logger/format', '@acme/logger'],
    ['react-dom/client', 'react-dom'],
  ])('maps %s to %s', (specifier, packageName) => {
    expect(toPackageName(specifier)).toBe(packageName)
  })

  test.each([
    'node:fs',
    'node:fs/promises',
    'fs',
    'fs/promises',
    'path/posix',
    'child_process',
    'bun',
    'bun:sqlite',
    'bun:test',
  ])('drops the builtin %s', (specifier) => {
    expect(toPackageName(specifier)).toBeNull()
  })

  test.each([
    './local',
    '../parent/module',
    '/absolute/path',
    '@/shared/finding',
    '~/components/button',
    '#internal/config',
    'https://example.com/module.js',
    '@',
    '',
  ])('drops the local or malformed specifier %s', (specifier) => {
    expect(toPackageName(specifier)).toBeNull()
  })
})
