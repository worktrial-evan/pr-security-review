// sample findings for the shared contract tests, one per detector variant
import {
  type CodeReviewFinding,
  createFindingId,
  type ScaFinding,
  type SecretFinding,
} from './finding'

// a vulnerable lodash version reached through a direct import
export const scaFindingSample: ScaFinding = {
  id: createFindingId({
    detector: 'sca',
    stableKey: 'lodash@4.17.20:GHSA-35jh-r3h4-6jhm',
  }),
  detector: 'sca',
  severity: 'high',
  confidence: 0.9,
  title: 'lodash 4.17.20 is affected by GHSA-35jh-r3h4-6jhm',
  file: 'package.json',
  startLine: 12,
  endLine: 12,
  isIntroducedByPullRequest: true,
  summary:
    'Command injection through the template function in lodash before 4.17.21.',
  remediation: 'Upgrade lodash to 4.17.21.',
  summarySource: 'template',
  packageName: 'lodash',
  version: '4.17.20',
  advisoryId: 'GHSA-35jh-r3h4-6jhm',
  aliases: ['CVE-2021-23337'],
  isGithubReviewed: true,
  dependencyScope: 'prod',
  reachability: 'direct-imported',
  importedBy: ['src/render.ts'],
  dependencyPath: ['lodash@4.17.20'],
  fixedVersions: ['4.17.21'],
  cvssScore: 7.2,
  isVersionUnparseable: false,
  matcherAgreement: 'both',
}

// a sql injection the code-review detector traced from a request parameter to a query
export const codeReviewFindingSample: CodeReviewFinding = {
  id: createFindingId({
    detector: 'code-review',
    stableKey: 'src/users.ts:42:CWE-89',
  }),
  detector: 'code-review',
  severity: 'critical',
  confidence: 0.8,
  title: 'User id is interpolated into a sql query',
  file: 'src/users.ts',
  startLine: 42,
  endLine: 44,
  isIntroducedByPullRequest: true,
  summary:
    'The id query parameter reaches the query string without a parameter binding.',
  remediation: 'Pass the id as a bound parameter.',
  summarySource: 'model',
  cwe: 'CWE-89',
  evidence: [
    'const query = "select * from users where id = " + request.query.id',
  ],
  sourceToSink: 'request.query.id -> query -> database.run',
  promptVersion: '1',
  model: 'claude-sonnet-4-5',
}

// a made-up github token committed in a config file
export const secretFindingSample: SecretFinding = {
  id: createFindingId({
    detector: 'secrets',
    stableKey: 'config/deploy.yml:7:github-token',
  }),
  detector: 'secrets',
  severity: 'critical',
  confidence: 1,
  title: 'GitHub token committed in config/deploy.yml',
  file: 'config/deploy.yml',
  startLine: 7,
  endLine: 7,
  isIntroducedByPullRequest: false,
  ruleId: 'github-token',
  fingerprint: 'sha256:0123456789abcdef',
}
