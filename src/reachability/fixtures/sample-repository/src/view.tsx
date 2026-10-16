// fixture: a React view importing the scoped package without a subpath
import { createLogger } from '@acme/logger'
import { useState } from 'react'

export function View() {
  const [label] = useState(createLogger)
  return <p>{String(label)}</p>
}
