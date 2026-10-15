// renders a prompt template by filling its {{variable}} placeholders, and finds the placeholders a template uses
import type { PromptTemplate } from '@/shared/llm'

// a {{name}} placeholder. the name starts with a letter and holds letters, digits and underscores
const placeholderPattern = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g

/**
 * Returns the distinct placeholder names in a template text, in order of first use.
 */
export function findPlaceholderNames(text: string): string[] {
  // collect each name once
  const placeholderMatches = text.matchAll(placeholderPattern)
  const placeholderNames = new Set<string>()
  for (const placeholderMatch of placeholderMatches) {
    placeholderNames.add(placeholderMatch[1] as string)
  }
  return [...placeholderNames]
}

/**
 * Fills every placeholder in a template and throws when a declared variable has no value.
 */
export function renderPrompt(
  template: PromptTemplate,
  variables: Record<string, string>,
): string {
  // reject a template variable without a value
  const missingVariableNames = template.variables.filter(
    (variableName) => variables[variableName] === undefined,
  )
  if (missingVariableNames.length > 0) {
    throw new Error(
      `prompt ${template.id} v${template.version} is missing variables: ${missingVariableNames.join(', ')}`,
    )
  }

  // replace in one pass so a value that contains braces is never expanded again
  return template.text.replace(
    placeholderPattern,
    (placeholder, name: string) => {
      const variableValue = variables[name]
      if (variableValue === undefined) {
        throw new Error(
          `prompt ${template.id} v${template.version} uses undeclared placeholder ${placeholder}`,
        )
      }
      return variableValue
    },
  )
}
