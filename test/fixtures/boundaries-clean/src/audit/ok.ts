// an audit file that imports shared through the "@/" alias, which the matrix grants

import { sharedThing } from '@/shared/thing'

// re-expose the shared value from audit
export const okThing = sharedThing
