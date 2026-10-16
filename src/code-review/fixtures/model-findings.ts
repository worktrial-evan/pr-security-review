// the sample model finding for the code review tests: the SQL injection the sql injection changed file adds
import type { ModelFinding } from '../model-output'

// a grounded finding on the second added line of sqlInjectionChangedFile in ./changed-files
export const sqlInjectionModelFinding: ModelFinding = {
  cwe: 'CWE-89',
  title: 'SQL query built from the id query parameter',
  severity: 'high',
  confidence: 0.95,
  file: 'src/users/find-user.ts',
  startLine: 15,
  endLine: 15,
  evidence: [
    '  const rows = await database.query("SELECT * FROM users WHERE id = " + userId)',
  ],
  sourceToSink:
    'The id query parameter of the request is concatenated into the SQL string that database.query executes.',
  remediation:
    'Pass the id as a bound parameter instead of concatenating it into the query.',
}
