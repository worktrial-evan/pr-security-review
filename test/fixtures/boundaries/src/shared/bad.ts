// a shared file that breaks the matrix by importing audit through a relative path

import { auditThing } from '../audit/thing'

// re-expose the audit value from shared
export const badThing = auditThing
