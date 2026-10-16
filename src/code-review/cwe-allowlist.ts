// the CWE allowlist a code review finding must name, with its membership check and its rendered form

// the weaknesses a pull request reviewer reports, each reachable from an untrusted input, in the order the prompt lists them
export const allowedCwes = [
  { id: 'CWE-20', name: 'Improper Input Validation' },
  { id: 'CWE-22', name: 'Path Traversal' },
  { id: 'CWE-78', name: 'OS Command Injection' },
  { id: 'CWE-79', name: 'Cross-site Scripting' },
  { id: 'CWE-89', name: 'SQL Injection' },
  { id: 'CWE-94', name: 'Code Injection' },
  { id: 'CWE-200', name: 'Exposure of Sensitive Information' },
  { id: 'CWE-287', name: 'Improper Authentication' },
  { id: 'CWE-295', name: 'Improper Certificate Validation' },
  { id: 'CWE-306', name: 'Missing Authentication for Critical Function' },
  { id: 'CWE-352', name: 'Cross-Site Request Forgery' },
  { id: 'CWE-400', name: 'Uncontrolled Resource Consumption' },
  { id: 'CWE-434', name: 'Unrestricted Upload of Dangerous File Type' },
  { id: 'CWE-502', name: 'Deserialization of Untrusted Data' },
  { id: 'CWE-601', name: 'Open Redirect' },
  { id: 'CWE-611', name: 'XML External Entity Injection' },
  { id: 'CWE-862', name: 'Missing Authorization' },
  { id: 'CWE-863', name: 'Incorrect Authorization' },
  { id: 'CWE-915', name: 'Mass Assignment' },
  { id: 'CWE-918', name: 'Server-Side Request Forgery' },
  { id: 'CWE-1321', name: 'Prototype Pollution' },
  { id: 'CWE-1333', name: 'Regular Expression Denial of Service' },
] as const satisfies readonly { id: string; name: string }[]

// the allowed ids, built once for the membership check
const allowedCweIds = new Set<string>(
  allowedCwes.map((allowedCwe) => allowedCwe.id),
)

/**
 * Tells whether a CWE id is on the allowlist.
 */
export function isAllowedCwe(cwe: string): boolean {
  return allowedCweIds.has(cwe)
}

/**
 * Renders the allowlist as one "CWE-NNN: Name" line per entry, in tuple order.
 */
export function renderCweAllowlist(): string {
  const allowlistLines = allowedCwes.map(
    (allowedCwe) => `${allowedCwe.id}: ${allowedCwe.name}`,
  )
  return allowlistLines.join('\n')
}
