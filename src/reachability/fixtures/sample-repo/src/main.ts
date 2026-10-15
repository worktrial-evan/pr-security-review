// fixture: every static import form, export-from, a subpath import, a scoped package and the specifiers that name no package
import defaultExport from 'default-import'
import { namedExport } from 'named-import'
import * as namespaceImport from 'namespace-import'
import 'side-effect-import'
import { Database } from 'bun:sqlite'
import { readFile } from 'node:fs/promises'
import { createLogger } from '@acme/logger/format'
import merge from 'lodash/merge'
import { join } from 'path'
import type { TypeOnly } from 'type-only-import'
import { internal } from '#internal'
import { config } from '@/config'
import { theme } from '~/theme'
import { helper } from './helper'

export { reexported } from 'export-from'
export * from 'export-star'
export type { ExportedType } from 'type-only-export'

// keep every import in use
export const usedValues: unknown[] = [
  defaultExport,
  namedExport,
  namespaceImport,
  merge,
  createLogger,
  readFile,
  join,
  Database,
  helper,
  config,
  theme,
  internal,
]
export type UsedType = TypeOnly
