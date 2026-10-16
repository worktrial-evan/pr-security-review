// tests the cli argument parsing for review and benchmark. also tests rejected values and the handler's exit status
import { describe, expect, test } from 'bun:test'
import {
  type BenchmarkRunCommandOptions,
  type CliHandlers,
  type ReviewCommandOptions,
  runCli,
} from './program'
import type { CliOutput } from './terminal-text'

// the handlers' recorded calls and the text written to each stream
interface RecordedRun {
  exitCode: number
  reviewCalls: ReviewCommandOptions[]
  benchmarkRunCalls: BenchmarkRunCommandOptions[]
  validateMatcherCallCount: number
  standardOutput: string
  standardError: string
}

// the status the recording handlers return, or the error they throw instead
interface RecordedHandlerOutcome {
  handlerExitCode?: number
  handlerError?: Error
}

// run the cli with handlers that record their options and return the given status
async function runRecordedCli(
  commandArguments: string[],
  { handlerExitCode = 0, handlerError }: RecordedHandlerOutcome = {},
): Promise<RecordedRun> {
  // record every call and every write
  const reviewCalls: ReviewCommandOptions[] = []
  const benchmarkRunCalls: BenchmarkRunCommandOptions[] = []
  let validateMatcherCallCount = 0
  const writtenText = { standardOutput: '', standardError: '' }
  const output: CliOutput = {
    writeOut: (text) => {
      writtenText.standardOutput += text
    },
    writeErr: (text) => {
      writtenText.standardError += text
    },
  }
  const handlers: CliHandlers = {
    review: async (options) => {
      reviewCalls.push(options)
      if (handlerError !== undefined) {
        throw handlerError
      }
      return handlerExitCode
    },
    benchmarkRun: async (options) => {
      benchmarkRunCalls.push(options)
      return handlerExitCode
    },
    benchmarkShow: async () => handlerExitCode,
    refreshAdvisories: async () => handlerExitCode,
    validateMatcher: async () => {
      validateMatcherCallCount += 1
      return handlerExitCode
    },
  }

  const exitCode = await runCli({ commandArguments, handlers, output })
  return {
    exitCode,
    reviewCalls,
    benchmarkRunCalls,
    validateMatcherCallCount,
    ...writtenText,
  }
}

describe('review', () => {
  test('parses the defaults', async () => {
    const recordedRun = await runRecordedCli([
      'review',
      'octocat/hello-world#42',
    ])

    expect(recordedRun.reviewCalls).toEqual([
      {
        target: { kind: 'github', pullRequest: 'octocat/hello-world#42' },
        format: 'html',
        outDirectory: undefined,
        failOnSeverity: undefined,
        isLlmEnabled: true,
        isCacheEnabled: true,
        isOffline: false,
        reviewModelId: undefined,
        summarizeModelId: undefined,
        reviewPromptVersion: undefined,
      },
    ])
  })

  test('parses every flag', async () => {
    const recordedRun = await runRecordedCli([
      'review',
      'https://github.com/octocat/hello-world/pull/42',
      '--format',
      'json',
      '--out',
      'reports/one',
      '--fail-on',
      'high',
      '--no-llm',
      '--no-cache',
      '--offline',
      '--model-review',
      'fireworks/review-model',
      '--model-summarize',
      'fireworks/summarize-model',
      '--review-prompt-version',
      '2',
    ])

    expect(recordedRun.reviewCalls[0]).toEqual({
      target: {
        kind: 'github',
        pullRequest: 'https://github.com/octocat/hello-world/pull/42',
      },
      format: 'json',
      outDirectory: 'reports/one',
      failOnSeverity: 'high',
      isLlmEnabled: false,
      isCacheEnabled: false,
      isOffline: true,
      reviewModelId: 'fireworks/review-model',
      summarizeModelId: 'fireworks/summarize-model',
      reviewPromptVersion: '2',
    })
  })

  test('parses the local form into a local target', async () => {
    const recordedRun = await runRecordedCli([
      'review',
      '--repo',
      '/tmp/project',
      '--base',
      'aaa111',
      '--head',
      'bbb222',
      '--no-llm',
    ])

    expect(recordedRun.exitCode).toBe(0)
    expect(recordedRun.reviewCalls[0]?.target).toEqual({
      kind: 'local',
      repositoryPath: '/tmp/project',
      baseSha: 'aaa111',
      headSha: 'bbb222',
    })
  })

  test('refuses a pull request mixed with a local option naming the rule', async () => {
    const recordedRun = await runRecordedCli([
      'review',
      'octocat/hello-world#42',
      '--repo',
      '/tmp/project',
    ])

    expect(recordedRun.exitCode).not.toBe(0)
    expect(recordedRun.reviewCalls).toEqual([])
    expect(recordedRun.standardError).toContain(
      '--repo cannot go with a pull request',
    )
    expect(recordedRun.standardError).toContain(
      '--repo, --base and --head together with no pull request',
    )
  })

  test('refuses an incomplete local form naming the missing option', async () => {
    const recordedRun = await runRecordedCli([
      'review',
      '--repo',
      '/tmp/project',
      '--base',
      'aaa111',
    ])

    expect(recordedRun.exitCode).not.toBe(0)
    expect(recordedRun.reviewCalls).toEqual([])
    expect(recordedRun.standardError).toContain('missing --head')
  })

  test('returns the handler exit status', async () => {
    const recordedRun = await runRecordedCli(
      ['review', 'octocat/hello-world#42'],
      { handlerExitCode: 1 },
    )

    expect(recordedRun.exitCode).toBe(1)
  })

  test('prints an error the handler lets escape as one line and exits 2', async () => {
    const recordedRun = await runRecordedCli(
      ['review', 'octocat/hello-world#42'],
      { handlerError: new Error('model id sonnet names no provider') },
    )

    expect(recordedRun.exitCode).toBe(2)
    expect(recordedRun.standardError).toBe(
      'error: model id sonnet names no provider\n',
    )
  })

  test('rejects an unknown format, a fail-on of info and a prompt version that is not a whole number', async () => {
    const formatRun = await runRecordedCli([
      'review',
      'a/b#1',
      '--format',
      'pdf',
    ])
    const failOnRun = await runRecordedCli([
      'review',
      'a/b#1',
      '--fail-on',
      'info',
    ])
    const versionRun = await runRecordedCli([
      'review',
      'a/b#1',
      '--review-prompt-version',
      'v2',
    ])

    for (const rejectedRun of [formatRun, failOnRun, versionRun]) {
      expect(rejectedRun.exitCode).not.toBe(0)
      expect(rejectedRun.reviewCalls).toEqual([])
    }
    expect(formatRun.standardError).toContain('Allowed choices are html, json')
    expect(versionRun.standardError).toContain('positive whole number')
  })

  test('requires a pull request or the local form', async () => {
    const recordedRun = await runRecordedCli(['review'])

    expect(recordedRun.exitCode).not.toBe(0)
    expect(recordedRun.reviewCalls).toEqual([])
    expect(recordedRun.standardError).toContain(
      'error: review takes a pull request, or --repo, --base and --head together',
    )
  })
})

describe('benchmark run', () => {
  test('parses the split, the label and the prompt version override', async () => {
    const recordedRun = await runRecordedCli([
      'benchmark',
      'run',
      '--split',
      'all',
      '--label',
      'baseline',
      '--review-prompt-version',
      '3',
      '--no-cache',
    ])

    expect(recordedRun.benchmarkRunCalls).toEqual([
      {
        split: 'all',
        label: 'baseline',
        isLlmEnabled: true,
        isCacheEnabled: false,
        reviewPromptVersion: '3',
      },
    ])
  })

  test('requires the split and the label', async () => {
    const noSplitRun = await runRecordedCli([
      'benchmark',
      'run',
      '--label',
      'x',
    ])
    const noLabelRun = await runRecordedCli([
      'benchmark',
      'run',
      '--split',
      'dev',
    ])

    expect(noSplitRun.exitCode).not.toBe(0)
    expect(noLabelRun.exitCode).not.toBe(0)
    expect(noSplitRun.benchmarkRunCalls).toEqual([])
    expect(noLabelRun.benchmarkRunCalls).toEqual([])
  })
})

describe('validate-matcher', () => {
  test('runs the handler and returns its status', async () => {
    const recordedRun = await runRecordedCli(['validate-matcher'], {
      handlerExitCode: 1,
    })

    expect(recordedRun.validateMatcherCallCount).toBe(1)
    expect(recordedRun.exitCode).toBe(1)
  })
})

describe('root', () => {
  test('prints help with no command and rejects an unknown one', async () => {
    const helpRun = await runRecordedCli([])
    const unknownRun = await runRecordedCli(['frobnicate'])

    expect(helpRun.exitCode).toBe(0)
    expect(helpRun.standardOutput).toContain(
      'Usage: pull-request-review [options] [command]',
    )
    expect(helpRun.standardOutput).toContain('review [options] [pull-request]')
    expect(unknownRun.exitCode).toBe(1)
    expect(unknownRun.standardError).toContain("unknown command 'frobnicate'")
  })
})
