// an audit file that breaks the matrix by importing llm through the "@/" alias

import { llmThing } from '@/llm/thing'

// re-expose the llm value from audit
export const aliasBadThing = llmThing
