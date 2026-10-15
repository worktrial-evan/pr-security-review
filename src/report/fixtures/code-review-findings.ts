// builds the code review fixture findings: nine weaknesses in the changed code with evidence lines
import { type CodeReviewFinding, createFindingId } from '@/shared/finding'

// the fields that differ between code review fixture findings. every other field has a default
type CodeReviewFixtureOptions = Pick<
  CodeReviewFinding,
  'cwe' | 'severity' | 'title' | 'evidence' | 'sourceToSink'
> &
  Partial<CodeReviewFinding>

// the fields most fixture findings share
const codeReviewFixtureDefaults = {
  detector: 'code-review',
  confidence: 0.8,
  isIntroducedByPullRequest: true,
  promptVersion: '3',
  model: 'claude-sonnet-4-5',
  summarySource: 'model',
} as const

// build one code review fixture finding with its id derived from the location and weakness
function createCodeReviewFixture(
  options: CodeReviewFixtureOptions,
): CodeReviewFinding {
  // derive the id from the weakness and where it sits
  const { cwe, file, startLine } = options
  const findingId = createFindingId({
    detector: 'code-review',
    stableKey: `${cwe}:${file ?? 'no-file'}:${startLine ?? 0}`,
  })

  // let the options override every default
  return { ...codeReviewFixtureDefaults, id: findingId, ...options }
}

// the code review findings in the fixture review result
export const codeReviewFixtureFindings: CodeReviewFinding[] = [
  createCodeReviewFixture({
    cwe: 'CWE-89',
    severity: 'critical',
    title: 'SQL injection through the search term',
    file: 'src/db/search.ts',
    startLine: 41,
    endLine: 47,
    confidence: 0.93,
    evidence: [
      'const term = request.query.term',
      'const sql = "SELECT * FROM posts WHERE title LIKE \'%" + term + "%\'"',
      'return database.query(sql)',
    ],
    sourceToSink:
      'request.query.term flows into database.query without binding',
    summary: 'The search term is concatenated into the SQL text.',
    remediation: 'Pass the term as a bound parameter.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-79',
    severity: 'high',
    title: 'Unescaped <input> value reaches innerHTML',
    file: 'src/ui/render.ts',
    startLine: 18,
    endLine: 22,
    evidence: [
      'const label = form.elements.label.value',
      "preview.innerHTML = '<b>' + label + '</b>'",
    ],
    sourceToSink: 'form label value flows into preview.innerHTML',
    summary: 'The label is written as markup and can carry a script.',
    remediation: 'Assign the label to textContent instead.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-22',
    severity: 'high',
    title: 'Download path is built from the request without a check',
    file: 'src/files/download.ts',
    startLine: 30,
    endLine: 34,
    confidence: 0.86,
    evidence: [
      'const name = request.params.name',
      'return Bun.file(join(uploadsDirectory, name))',
    ],
    sourceToSink: 'request.params.name flows into Bun.file',
    summary: 'A name with parent segments can leave the uploads directory.',
    remediation: 'Reject names that resolve outside the uploads directory.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-918',
    severity: 'medium',
    title: 'Proxy fetches a url chosen by the caller',
    file: 'src/http/proxy.ts',
    startLine: 12,
    endLine: 15,
    confidence: 0.7,
    evidence: ['const target = request.query.url', 'return fetch(target)'],
    sourceToSink: 'request.query.url flows into fetch',
    summary: 'The server can be pointed at internal addresses.',
    remediation: 'Allow only listed hosts.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-327',
    severity: 'medium',
    title: 'Password digest uses MD5',
    file: 'src/auth/hash.ts',
    startLine: 9,
    endLine: 9,
    isIntroducedByPullRequest: false,
    confidence: 0.97,
    evidence: ["return createHash('md5').update(password).digest('hex')"],
    sourceToSink: 'password flows into a fast unsalted digest',
    summary: 'MD5 digests are cheap to brute force.',
    remediation: 'Use Bun.password.hash.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-352',
    severity: 'low',
    title: 'Settings form accepts a post without a token',
    file: 'src/routes/settings.ts',
    startLine: 55,
    endLine: 60,
    confidence: 0.55,
    evidence: ["router.post('/settings', saveSettings)"],
    sourceToSink: 'a cross-site post reaches saveSettings',
    summary: 'No anti-forgery token is checked on the settings route.',
    remediation: 'Check a per-session token on state-changing routes.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-209',
    severity: 'info',
    title: 'Error response includes the stack trace',
    file: 'src/errors.ts',
    startLine: 14,
    endLine: 14,
    confidence: 0.6,
    evidence: ['return Response.json({ message, stack: error.stack })'],
    sourceToSink: 'error.stack flows into the response body',
    summary: 'Stack traces show internal paths to the caller.',
    remediation: 'Log the stack and return only the message.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-78',
    severity: 'high',
    title: 'Shell command is built from a job name',
    file: 'src/jobs/run.ts',
    startLine: 22,
    endLine: 26,
    isIntroducedByPullRequest: false,
    confidence: 0.82,
    evidence: ["await run('sh -c \"run-job ' + job.name + '\"')"],
    sourceToSink: 'job.name flows into a shell string',
    summary: 'A job name with shell syntax runs extra commands.',
    remediation: 'Pass the name as an argument, not inside a shell string.',
  }),
  createCodeReviewFixture({
    cwe: 'CWE-307',
    severity: 'low',
    title: 'Login has no limit on failed attempts',
    confidence: 0.4,
    evidence: [],
    sourceToSink: 'repeated login requests reach the password check',
  }),
]
