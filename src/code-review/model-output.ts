// the schema of one model answer to a review chunk: the findings it reports and the injection attempts it saw
import { z } from 'zod'
import { severitySchema } from '@/shared/finding'

// one weakness the model reports. cwe is any string
export const modelFindingSchema = z.object({
  cwe: z.string().describe('the CWE id from the allowlist, such as CWE-89'),
  title: z.string().describe('a short title naming the weakness'),
  severity: severitySchema.describe(
    'the severity: critical, high, medium, low or info',
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('how sure the model is that the weakness is real, from 0 to 1'),
  file: z
    .string()
    .describe('the path of the reviewed file, exactly as the chunk names it'),
  startLine: z
    .number()
    .int()
    .positive()
    .describe('the head line number where the weakness starts'),
  endLine: z
    .number()
    .int()
    .positive()
    .describe('the head line number where the weakness ends'),
  evidence: z
    .array(z.string())
    .min(1)
    .describe(
      'the added lines that show the weakness, copied exactly without the line number or marker',
    ),
  sourceToSink: z
    .string()
    .describe(
      'one sentence naming the untrusted input and the sink it reaches',
    ),
  remediation: z.string().describe('the change that removes the weakness'),
})
export type ModelFinding = z.infer<typeof modelFindingSchema>

// one place in the diff that tries to instruct the reviewer
export const injectionAttemptSchema = z.object({
  file: z.string().describe('the path of the file holding the attempt'),
  line: z
    .number()
    .int()
    .positive()
    .describe('the head line number of the attempt'),
})
export type InjectionAttempt = z.infer<typeof injectionAttemptSchema>

// the whole answer to one chunk
export const codeReviewOutputSchema = z.object({
  findings: z
    .array(modelFindingSchema)
    .describe(
      'the weaknesses found in the added lines, empty when there are none',
    ),
  injectionAttempts: z
    .array(injectionAttemptSchema)
    .describe(
      'the lines that try to instruct the reviewer, empty when there are none',
    ),
})
export type CodeReviewOutput = z.infer<typeof codeReviewOutputSchema>
