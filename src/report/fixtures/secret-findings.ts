// builds the secrets fixture findings: six leaked credentials identified by rule and fingerprint only
import { createFindingId, type SecretFinding } from '@/shared/finding'

// the fields that differ between secrets fixture findings. every other field has a default
type SecretFixtureOptions = Pick<
  SecretFinding,
  'ruleId' | 'severity' | 'title' | 'file' | 'startLine' | 'fingerprint'
> &
  Partial<SecretFinding>

// the fields most fixture findings share
const secretFixtureDefaults = {
  detector: 'secrets',
  confidence: 0.99,
  isIntroducedByPullRequest: true,
  summarySource: 'model',
} as const

// build one secrets fixture finding with its id derived from the rule and fingerprint
function createSecretFixture(options: SecretFixtureOptions): SecretFinding {
  // derive the id and set the end line to the start line
  const { ruleId, fingerprint, startLine } = options
  const findingId = createFindingId({
    detector: 'secrets',
    stableKey: `${ruleId}:${fingerprint}`,
  })

  // let the options override every default
  return {
    ...secretFixtureDefaults,
    id: findingId,
    endLine: startLine,
    ...options,
  }
}

// the secrets findings in the fixture review result
export const secretFixtureFindings: SecretFinding[] = [
  createSecretFixture({
    ruleId: 'github-token',
    severity: 'critical',
    title: 'GitHub token added to a configuration file',
    file: 'src/config/ci.ts',
    startLine: 8,
    fingerprint:
      '3b1f0c6e9a4d2f8b7c5e1a09d6f4b2c8e7a3d5f1b9c0e2a4d6f8b1c3e5a7d9f0',
    summary: 'A GitHub personal access token is committed in plain text.',
    remediation: 'Revoke the token and read it from the environment.',
  }),
  createSecretFixture({
    ruleId: 'aws-access-key-id',
    severity: 'high',
    title: 'AWS access key id added to a deploy script',
    file: 'scripts/deploy.sh',
    startLine: 14,
    fingerprint:
      '9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c',
    summary: 'An AWS access key id is set inline in the script.',
    remediation: 'Rotate the key and use a credentials profile.',
  }),
  createSecretFixture({
    ruleId: 'slack-webhook-url',
    severity: 'medium',
    title: 'Slack webhook url in the notification docs',
    file: 'docs/notify.md',
    startLine: 31,
    fingerprint:
      '5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d',
    isIntroducedByPullRequest: false,
    confidence: 0.9,
    summary: 'A working webhook url is shown as an example.',
    remediation: 'Replace it with a placeholder and rotate the webhook.',
  }),
  createSecretFixture({
    ruleId: 'generic-api-key',
    severity: 'low',
    title: 'Possible api key in a test fixture',
    file: 'test/fixtures/client.ts',
    startLine: 5,
    fingerprint:
      '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    confidence: 0.45,
  }),
  createSecretFixture({
    ruleId: 'private-key-header',
    severity: 'critical',
    title: 'Private key file added to the deploy folder',
    file: 'deploy/id_rsa.pem',
    startLine: 1,
    fingerprint:
      'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
    summary: 'A PEM private key header starts this file.',
    remediation: 'Remove the file, rotate the key and add it to .gitignore.',
  }),
  createSecretFixture({
    ruleId: 'jwt-signing-secret',
    severity: 'info',
    title: 'Signing secret assigned from a literal',
    file: 'src/auth/session.ts',
    startLine: 19,
    fingerprint:
      '7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b',
    isIntroducedByPullRequest: false,
    confidence: 0.6,
    summary: 'The session signing secret is a string literal.',
    summarySource: 'template',
  }),
]
