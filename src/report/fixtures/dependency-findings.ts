// builds the dependency fixture findings: twelve vulnerable dependencies that cover every dependency enum value
import { createFindingId, type DependencyFinding } from '@/shared/finding'

// the fields that differ between dependency fixture findings. every other field has a default
type DependencyFixtureOptions = Pick<
  DependencyFinding,
  'packageName' | 'version' | 'advisoryId' | 'severity'
> &
  Partial<DependencyFinding>

// the fields most fixture findings share
type DependencyFixtureDefaults = Omit<
  DependencyFinding,
  | 'id'
  | 'title'
  | 'dependencyPath'
  | 'packageName'
  | 'version'
  | 'advisoryId'
  | 'severity'
>

// the defaults most dependency fixture findings keep
const dependencyFixtureDefaults: DependencyFixtureDefaults = {
  detector: 'dependency',
  confidence: 0.95,
  file: 'package.json',
  isIntroducedByPullRequest: true,
  aliases: [],
  isGithubReviewed: true,
  dependencyScope: 'production',
  reachability: 'direct-imported',
  importedBy: [],
  fixedVersions: [],
  isVersionUnparseable: false,
  matcherAgreement: 'both',
}

// build one dependency fixture finding with its id derived from the package and advisory
function createDependencyFixture(
  options: DependencyFixtureOptions,
): DependencyFinding {
  // derive the id and the default title and dependency path
  const { packageName, version, advisoryId } = options
  const findingId = createFindingId({
    detector: 'dependency',
    stableKey: `${packageName}@${version}:${advisoryId}`,
  })
  const defaultTitle = `${packageName} ${version} is affected by ${advisoryId}`
  const defaultDependencyPath = [`${packageName}@${version}`]

  // let the options override every default
  return {
    ...dependencyFixtureDefaults,
    id: findingId,
    title: defaultTitle,
    dependencyPath: defaultDependencyPath,
    ...options,
  }
}

// the dependency findings in the fixture review result
export const dependencyFixtureFindings: DependencyFinding[] = [
  createDependencyFixture({
    packageName: 'lodash',
    version: '4.17.20',
    advisoryId: 'GHSA-35jh-r3h4-6jhm',
    severity: 'high',
    startLine: 12,
    endLine: 12,
    aliases: ['CVE-2021-23337'],
    importedBy: ['src/render.ts', 'src/format.ts'],
    fixedVersions: ['4.17.21'],
    cvssScore: 7.2,
    summary:
      'Command injection through the template function in lodash before 4.17.21.',
    remediation: 'Upgrade lodash to 4.17.21.',
    summarySource: 'template',
  }),
  createDependencyFixture({
    packageName: 'minimist',
    version: '1.2.5',
    advisoryId: 'GHSA-xvch-5gv4-984h',
    severity: 'critical',
    startLine: 31,
    endLine: 31,
    aliases: ['CVE-2021-44906'],
    reachability: 'transitive',
    dependencyPath: ['mkdirp@0.5.5', 'minimist@1.2.5'],
    fixedVersions: ['1.2.6'],
    cvssScore: 9.8,
    summary: 'Prototype pollution through crafted command line arguments.',
    remediation: 'Upgrade mkdirp so it resolves minimist 1.2.6 or later.',
    summarySource: 'model',
  }),
  createDependencyFixture({
    packageName: 'semver',
    version: '7.3.5',
    advisoryId: 'GHSA-c2qf-rxjj-qqgw',
    severity: 'medium',
    startLine: 44,
    endLine: 44,
    aliases: ['CVE-2022-25883'],
    reachability: 'direct-unused',
    matcherAgreement: 'handwritten-only',
    fixedVersions: ['7.5.2'],
    cvssScore: 5.3,
    summary: 'Regular expression denial of service in version range parsing.',
    remediation: 'Upgrade semver to 7.5.2 or later.',
    summarySource: 'model',
  }),
  createDependencyFixture({
    packageName: 'node-fetch',
    version: '2.6.0',
    advisoryId: 'GHSA-r683-j2x4-v87g',
    severity: 'high',
    startLine: 52,
    endLine: 52,
    aliases: ['CVE-2022-0235'],
    isGithubReviewed: false,
    reachability: 'transitive',
    matcherAgreement: 'oracle-only',
    dependencyPath: ['cross-fetch@3.0.4', 'node-fetch@2.6.0'],
    fixedVersions: ['2.6.7'],
    cvssScore: 8.8,
    summary: 'Cookies and authorization headers are forwarded on redirect.',
    remediation: 'Upgrade cross-fetch so it resolves node-fetch 2.6.7.',
    summarySource: 'template',
  }),
  createDependencyFixture({
    packageName: 'glob-parent',
    version: '5.1.1',
    advisoryId: 'GHSA-ww39-953v-wcq6',
    severity: 'high',
    startLine: 58,
    endLine: 58,
    aliases: ['CVE-2020-28469'],
    dependencyScope: 'development',
    reachability: 'transitive',
    matcherAgreement: 'oracle-unavailable',
    dependencyPath: ['chokidar@3.4.0', 'glob-parent@5.1.1'],
    fixedVersions: ['5.1.2'],
    cvssScore: 7.5,
    summary: 'Regular expression denial of service in glob enclosure handling.',
    remediation: 'Upgrade chokidar so it resolves glob-parent 5.1.2.',
    summarySource: 'template',
  }),
  createDependencyFixture({
    packageName: 'braces',
    version: '3.0.2',
    advisoryId: 'GHSA-grv7-fg5c-xmjg',
    severity: 'high',
    startLine: 63,
    endLine: 63,
    aliases: ['CVE-2024-4068'],
    isIntroducedByPullRequest: false,
    dependencyScope: 'development',
    reachability: 'transitive',
    dependencyPath: ['micromatch@4.0.5', 'braces@3.0.2'],
    fixedVersions: ['3.0.3'],
    cvssScore: 7.5,
    summary: 'Uncontrolled resource consumption on unbalanced brace patterns.',
    remediation: 'Upgrade micromatch so it resolves braces 3.0.3.',
    summarySource: 'template',
  }),
  createDependencyFixture({
    packageName: 'tar',
    version: '4.4.13',
    advisoryId: 'GHSA-r628-mhmh-qjhw',
    severity: 'high',
    startLine: 70,
    endLine: 70,
    aliases: ['CVE-2021-37701'],
    isIntroducedByPullRequest: false,
    reachability: 'transitive',
    dependencyPath: ['node-gyp@7.1.2', 'tar@4.4.13'],
    fixedVersions: ['4.4.16'],
    cvssScore: 8.2,
    summary: 'Arbitrary file creation through crafted symlinks in an archive.',
    remediation: 'Upgrade node-gyp so it resolves tar 4.4.16 or later.',
    summarySource: 'model',
  }),
  createDependencyFixture({
    packageName: 'word-wrap',
    version: '1.2.3',
    advisoryId: 'GHSA-j8xg-fqg3-53r7',
    severity: 'low',
    startLine: 75,
    endLine: 75,
    aliases: ['CVE-2023-26115'],
    dependencyScope: 'development',
    reachability: 'direct-unused',
    fixedVersions: ['1.2.4'],
    cvssScore: 3.7,
    summary: 'Regular expression denial of service when wrapping long text.',
    remediation: 'Upgrade word-wrap to 1.2.4.',
    summarySource: 'template',
  }),
  createDependencyFixture({
    packageName: 'ejs',
    version: '3.1.6',
    advisoryId: 'GHSA-phwq-j96m-2c2q',
    severity: 'critical',
    startLine: 81,
    endLine: 81,
    aliases: ['CVE-2022-29078'],
    matcherAgreement: 'handwritten-only',
    importedBy: ['src/views/render-template.ts'],
    fixedVersions: ['3.1.7'],
    cvssScore: 9.8,
    summary: 'Template injection through the settings option of render.',
    remediation: 'Upgrade ejs to 3.1.7 or later.',
    summarySource: 'model',
  }),
  createDependencyFixture({
    packageName: 'ua-parser-js',
    version: '0.7.29',
    advisoryId: 'GHSA-pjwm-rvh2-c87w',
    severity: 'info',
    startLine: 88,
    endLine: 88,
    aliases: ['CVE-2022-25927'],
    isGithubReviewed: false,
    isIntroducedByPullRequest: false,
    reachability: 'transitive',
    matcherAgreement: 'oracle-only',
    dependencyPath: ['analytics-lite@2.0.1', 'ua-parser-js@0.7.29'],
    fixedVersions: ['0.7.33'],
    cvssScore: 0,
  }),
  createDependencyFixture({
    packageName: 'acme-internal-utils',
    version: '1.0.0-custom',
    advisoryId: 'GHSA-aaaa-bbbb-cccc',
    severity: 'low',
    startLine: 93,
    endLine: 93,
    isGithubReviewed: false,
    dependencyScope: 'development',
    reachability: 'direct-unused',
    matcherAgreement: 'oracle-unavailable',
    isVersionUnparseable: true,
    summary: 'The installed version is a custom build and cannot be compared.',
    remediation: 'Replace the custom build with a published release.',
    summarySource: 'model',
  }),
  createDependencyFixture({
    packageName: 'express',
    version: '4.17.1',
    advisoryId: 'GHSA-qw6h-vgh9-j6wx',
    severity: 'medium',
    startLine: 99,
    endLine: 99,
    aliases: ['CVE-2024-43796', 'CVE-2024-29041'],
    importedBy: ['src/server.ts', 'src/routes/index.ts'],
    fixedVersions: ['4.20.0', '5.0.0'],
    cvssScore: 5,
    summary:
      'Cross-site scripting through redirect targets in response.redirect.',
    remediation: 'Upgrade express to 4.20.0 or later.',
    summarySource: 'model',
  }),
]
