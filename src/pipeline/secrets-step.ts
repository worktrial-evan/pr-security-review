// the secrets step. it notes every added line too long to scan and then runs the secrets detector over the reviewed files
import { listOverlongAddedLines } from '@/secrets/detect-secrets'
import type { SecretFinding } from '@/shared/finding'
import type { ChangedFile } from '@/shared/pull-request-source'
import { type RunRecord, writeRunNote } from './run-record'

// a function that finds secrets in the added lines of changed files
export type DetectSecrets = (options: {
  changedFiles: ChangedFile[]
}) => SecretFinding[]

// the files to scan and the detector to run. also the record to note skipped lines in
export interface RunSecretsDetectorOptions {
  reviewedFiles: ChangedFile[]
  detectSecrets: DetectSecrets
  runRecord: RunRecord
}

/**
 * Writes a note for every added line skipped for its length and returns the detector's findings.
 */
export async function runSecretsDetector({
  reviewedFiles,
  detectSecrets,
  runRecord,
}: RunSecretsDetectorOptions): Promise<SecretFinding[]> {
  // note each line the detector skips for its length
  const overlongAddedLines = listOverlongAddedLines({
    changedFiles: reviewedFiles,
  })
  for (const overlongAddedLine of overlongAddedLines) {
    await writeRunNote({
      runRecord,
      step: 'secrets',
      payload: {
        message: 'added line skipped for length',
        ...overlongAddedLine,
      },
    })
  }

  return detectSecrets({ changedFiles: reviewedFiles })
}
