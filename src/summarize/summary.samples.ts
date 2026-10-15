// sample findings and an advisory for the summarize tests, one finding per detector variant
import type { Advisory } from '@/shared/advisory'
import {
  type CodeReviewFinding,
  createFindingId,
  type ScaFinding,
  type SecretFinding,
} from '@/shared/finding'

// the advisory behind the sample dependency finding
export const lodashAdvisorySample: Advisory = {
  id: 'GHSA-35jh-r3h4-6jhm',
  aliases: ['CVE-2021-23337'],
  summary: 'Command Injection in lodash',
  details:
    'lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.',
  affected: [
    {
      ecosystem: 'npm',
      name: 'lodash',
      ranges: [
        { type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] },
      ],
      versions: [],
    },
  ],
  references: [
    {
      type: 'ADVISORY',
      url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
    },
    { type: 'WEB', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337' },
  ],
  published: '2021-05-06T16:05:51Z',
  modified: '2024-02-13T12:00:00Z',
  isGithubReviewed: true,
}

// a vulnerable lodash reached through a scoped direct dependency
export const scaFindingSample: ScaFinding = {
  id: createFindingId({ detector: 'sca', stableKey: 'lodash@4.17.20' }),
  detector: 'sca',
  severity: 'high',
  confidence: 0.9,
  title: 'lodash 4.17.20 is affected by GHSA-35jh-r3h4-6jhm',
  file: 'bun.lock',
  isIntroducedByPullRequest: true,
  packageName: 'lodash',
  version: '4.17.20',
  advisoryId: 'GHSA-35jh-r3h4-6jhm',
  aliases: ['CVE-2021-23337'],
  isGithubReviewed: true,
  dependencyScope: 'prod',
  reachability: 'transitive',
  importedBy: [],
  dependencyPath: ['@acme/render@2.1.0', 'lodash@4.17.20'],
  fixedVersions: ['4.17.21'],
  cvssScore: 7.2,
  isVersionUnparseable: false,
  matcherAgreement: 'both',
}

// a sql injection traced from a request parameter to a query
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
  cwe: 'CWE-89',
  evidence: [
    'const query = "select * from users where id = " + request.query.id',
  ],
  sourceToSink: 'request.query.id -> query -> database.run',
  promptVersion: '1',
  model: 'anthropic/claude-sonnet-5-5',
}

// a made-up token committed in a config file before this pull request
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

// the advisories of the sample findings, keyed by advisory id
export const advisoriesByIdSample: ReadonlyMap<string, Advisory> = new Map([
  [lodashAdvisorySample.id, lodashAdvisorySample],
])
