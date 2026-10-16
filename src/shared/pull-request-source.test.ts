// tests for the pull-request-source contract: a renamed file round-trips with its previous path and a bad hunk line kind is rejected
import { describe, expect, test } from 'bun:test'
import {
  type ChangedFile,
  changedFileSchema,
  hunkLineSchema,
  type PullRequestDescription,
  pullRequestDescriptionSchema,
} from './pull-request-source'

// a file renamed and edited in one pull request
const renamedFileSample: ChangedFile = {
  path: 'src/render-report.ts',
  status: 'renamed',
  previousPath: 'src/render.ts',
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'context', headLine: 1, text: 'import { z } from "zod"' },
        { kind: 'removed', headLine: 2, text: 'export const name = "render"' },
        {
          kind: 'added',
          headLine: 2,
          text: 'export const name = "render-report"',
        },
      ],
    },
  ],
  addedLines: [{ line: 2, text: 'export const name = "render-report"' }],
  isBinary: false,
}

// the revisions of a pull request on github
const pullRequestDescriptionSample: PullRequestDescription = {
  baseSha: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
  headSha: '76543210f9e8d7c6b5a4938271605f4e3d2c1b0a',
  pullRequestReference: {
    owner: 'octocat',
    repository: 'hello-world',
    number: 42,
    url: 'https://github.com/octocat/hello-world/pull/42',
  },
}

describe('changedFileSchema', () => {
  test('a renamed file round-trips and keeps its previous path', () => {
    // parse the renamed file and read its previous path back
    const parsedChangedFile = changedFileSchema.parse(renamedFileSample)
    expect(parsedChangedFile).toEqual(renamedFileSample)
    expect(parsedChangedFile.previousPath).toBe('src/render.ts')
  })
})

describe('hunkLineSchema', () => {
  test('a kind other than added, removed or context is rejected', () => {
    // give the line a kind outside the hunk line kinds
    const badHunkLine = { kind: 'changed', headLine: 1, text: 'x' }
    expect(() => hunkLineSchema.parse(badHunkLine)).toThrow(/kind/)
  })
})

describe('pullRequestDescriptionSchema', () => {
  test('a description with a pull request reference round-trips', () => {
    expect(
      pullRequestDescriptionSchema.parse(pullRequestDescriptionSample),
    ).toEqual(pullRequestDescriptionSample)
  })
})
