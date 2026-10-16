// fixture: a JavaScript React file importing a subpath of a package
import { createRoot } from 'react-dom/client'

export function mountWidget(element) {
  createRoot(element).render(<span>widget</span>)
}
