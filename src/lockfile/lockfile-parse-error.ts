// the error a lockfile parser throws for a lockfile or root package.json it cannot read
import type { LockfileKind } from '@/shared/dependency'

// why a lockfile could not be read: unsupported-version, malformed
export const lockfileParseErrorReasons = [
  'unsupported-version',
  'malformed',
] as const
export type LockfileParseErrorReason =
  (typeof lockfileParseErrorReasons)[number]

// the lockfile kind, the reason and a detail for the message
export interface LockfileParseErrorOptions {
  lockfileKind: LockfileKind
  reason: LockfileParseErrorReason
  detail: string
}

// the error thrown for a lockfile that cannot be read. lockfileKind and reason name what went wrong
export class LockfileParseError extends Error {
  readonly lockfileKind: LockfileKind
  readonly reason: LockfileParseErrorReason

  constructor({ lockfileKind, reason, detail }: LockfileParseErrorOptions) {
    // name the kind and the reason in the message and keep them as fields
    super(`cannot parse the ${lockfileKind} lockfile (${reason}): ${detail}`)
    this.name = 'LockfileParseError'
    this.lockfileKind = lockfileKind
    this.reason = reason
  }
}
