// tests the worked examples of the shipped review prompt: each chunk re-renders through the packet byte for byte, each answer passes the output schema, and every finding in an answer grounds against the chunk's added lines
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { defaultPromptsDirectory, loadPrompt } from '@/prompts/prompt-loader'
import {
  type ChangedFile,
  changedFileSchema,
  type Hunk,
  type HunkLine,
  type HunkLineKind,
} from '@/shared/pull-request-source'
import { testContextLines, toAddedLines } from './fixtures/changed-files'
import {
  findFencedBlock,
  readFencedBlocks,
} from './fixtures/markdown-fenced-blocks'
import { groundFinding } from './grounding'
import { type CodeReviewOutput, codeReviewOutputSchema } from './model-output'
import { assembleReviewPacket, renderedHunkLinePattern } from './review-packet'
import { codeReviewPromptId } from './review-prompt'

// the shipped rubric and the raw text of its file
const codeReviewTemplate = await loadPrompt({ id: codeReviewPromptId })
const promptFilePath = join(
  defaultPromptsDirectory,
  codeReviewPromptId,
  `v${codeReviewTemplate.version}.md`,
)
const promptFileText = await Bun.file(promptFilePath).text()

// the start of a hunk header line
const hunkHeaderPrefix = '@@ '

// one worked example: its title, the chunk the model sees and the json it answers with
interface WorkedExample {
  title: string
  chunkText: string
  answerJson: string
}

// the three worked examples, each paired with its title for the test names
const workedExamples = readWorkedExamples(promptFileText)
const workedExampleCases: [string, WorkedExample][] = workedExamples.map(
  (workedExample) => [workedExample.title, workedExample],
)

describe('the worked examples of the code review prompt', () => {
  test('are a true positive, a tricky negative and a pre-existing issue, all in the loaded rubric', () => {
    expect(workedExamples.map((workedExample) => workedExample.title)).toEqual([
      'True positive',
      'Tricky negative',
      'Pre-existing issue',
    ])
    for (const workedExample of workedExamples) {
      expect(codeReviewTemplate.text).toContain(workedExample.chunkText)
      expect(codeReviewTemplate.text).toContain(workedExample.answerJson)
    }
  })

  test.each(workedExampleCases)(
    '%s re-renders its chunk through the packet byte for byte',
    (_title, workedExample) => {
      // parse the chunk back into a changed file and render it again
      const changedFile = parseChunkText(workedExample.chunkText)
      const packet = assembleReviewPacket({
        changedFiles: [changedFile],
        contextLines: testContextLines,
      })

      expect(packet.chunks).toHaveLength(1)
      expect(packet.chunks[0]?.text).toBe(workedExample.chunkText)
    },
  )

  test.each(workedExampleCases)(
    '%s answers with output that passes the schema and grounds every finding',
    (_title, workedExample) => {
      // parse the chunk and the answer it was given
      const changedFile = parseChunkText(workedExample.chunkText)
      const codeReviewOutput = parseAnswer(workedExample)

      for (const finding of codeReviewOutput.findings) {
        expect(
          groundFinding({
            finding,
            file: changedFile.path,
            addedLines: changedFile.addedLines,
          }),
        ).toEqual({ kind: 'grounded' })
      }
    },
  )

  test('report one finding for the true positive and nothing for the two negatives', () => {
    const codeReviewOutputs = workedExamples.map(parseAnswer)

    expect(
      codeReviewOutputs.map(
        (codeReviewOutput) => codeReviewOutput.findings.length,
      ),
    ).toEqual([1, 0, 0])
    expect(
      codeReviewOutputs.map(
        (codeReviewOutput) => codeReviewOutput.injectionAttempts.length,
      ),
    ).toEqual([0, 0, 0])
  })
})

// split the worked examples section of the prompt into its subsections, one example each
function readWorkedExamples(promptText: string): WorkedExample[] {
  // cut the section out, from its heading to the next top-level heading or the end
  const sectionStart = promptText.indexOf('\n# Worked examples\n')
  if (sectionStart === -1) {
    throw new Error('the prompt has no worked examples section')
  }
  const sectionText = cutAtNextTopLevelHeading(
    promptText.slice(sectionStart + 1),
  )

  // split at the subsection headings and drop the section heading before the first
  const subsectionTexts = sectionText.split('\n## ').slice(1)
  return subsectionTexts.map(parseWorkedExample)
}

// return the text up to the next top-level heading, or all of it when none follows
function cutAtNextTopLevelHeading(sectionText: string): string {
  const nextHeadingIndex = sectionText.indexOf('\n# ')
  if (nextHeadingIndex === -1) {
    return sectionText
  }
  return sectionText.slice(0, nextHeadingIndex)
}

// parse one subsection: its title on the first line, the first fenced block with no info string as the chunk and the first json block as the answer
function parseWorkedExample(subsectionText: string): WorkedExample {
  // read the title and every fenced block of the subsection
  const title = subsectionText.slice(0, subsectionText.indexOf('\n'))
  const fencedBlocks = readFencedBlocks({ text: subsectionText, title })

  return {
    title,
    chunkText: findFencedBlock({ fencedBlocks, infoString: '', title }),
    answerJson: findFencedBlock({ fencedBlocks, infoString: 'json', title }),
  }
}

// parse an example's answer through the output schema
function parseAnswer(workedExample: WorkedExample): CodeReviewOutput {
  return codeReviewOutputSchema.parse(JSON.parse(workedExample.answerJson))
}

// parse an example chunk back into the changed file it was rendered from: the path, status and previous path from the header lines, one hunk per hunk header, and the added lines from the + lines
function parseChunkText(chunkText: string): ChangedFile {
  // read the header values and the hunks
  const chunkLines = chunkText.split('\n')
  const path = readHeaderValue({ chunkLines, headerName: 'file' })
  const status = readHeaderValue({ chunkLines, headerName: 'status' })
  const previousPath = findHeaderValue({
    chunkLines,
    headerName: 'renamed from',
  })
  const hunks = parseHunks(chunkLines)

  // require the renamed status when a previous path is named
  if (previousPath !== undefined && status !== 'renamed') {
    throw new Error(
      `the example chunk names a previous path but has status ${status}`,
    )
  }

  // list the added lines in the added line shape
  const hunkLines = hunks.flatMap((hunk) => hunk.lines)
  const addedLines = toAddedLines(hunkLines)

  // parse the file through the contract
  return changedFileSchema.parse({
    path,
    status,
    previousPath,
    hunks,
    addedLines,
    isBinary: false,
  })
}

// the chunk lines to search and the header name before the colon
interface ReadHeaderValueOptions {
  chunkLines: string[]
  headerName: string
}

// return the value of the header line that starts with the name and a colon, and throw when the chunk has none
function readHeaderValue({
  chunkLines,
  headerName,
}: ReadHeaderValueOptions): string {
  const headerValue = findHeaderValue({ chunkLines, headerName })
  if (headerValue === undefined) {
    throw new Error(`the example chunk has no ${headerName} line`)
  }
  return headerValue
}

// return the value of the header line that starts with the name and a colon, or undefined when the chunk has none
function findHeaderValue({
  chunkLines,
  headerName,
}: ReadHeaderValueOptions): string | undefined {
  // find the header line by its prefix
  const headerPrefix = `${headerName}: `
  const headerLine = chunkLines.find((chunkLine) =>
    chunkLine.startsWith(headerPrefix),
  )

  return headerLine?.slice(headerPrefix.length)
}

// parse the hunks: a new hunk starts at each hunk header line, with every range at 0, and each numbered line joins the open hunk
function parseHunks(chunkLines: string[]): Hunk[] {
  const hunks: Hunk[] = []

  // open a hunk at each hunk header and add each numbered line to the last opened hunk
  for (const chunkLine of chunkLines) {
    if (chunkLine.startsWith(hunkHeaderPrefix)) {
      hunks.push({
        oldStart: 0,
        oldLines: 0,
        newStart: 0,
        newLines: 0,
        lines: [],
      })
      continue
    }
    const hunkLine = parseHunkLine(chunkLine)
    if (hunkLine === null) {
      continue
    }
    const openHunk = hunks.at(-1)
    if (openHunk === undefined) {
      throw new Error(
        `the example chunk has the numbered line ${JSON.stringify(chunkLine)} before its first hunk header`,
      )
    }
    openHunk.lines.push(hunkLine)
  }

  return hunks
}

// parse one numbered line into a hunk line, or null for a line without a head line and marker. a removed line shows 0 and every other line a positive head line
function parseHunkLine(chunkLine: string): HunkLine | null {
  // skip a line that is not a numbered line
  const hunkLineMatch = renderedHunkLinePattern.exec(chunkLine)
  if (!hunkLineMatch) {
    return null
  }

  // read the kind from the marker, the head line from the number and the text after them
  const kind = toHunkLineKind(hunkLineMatch[2] as string)
  const headLine = Number(hunkLineMatch[1])
  const text = hunkLineMatch[3] as string

  // reject a head line that disagrees with the kind
  if (kind === 'removed' && headLine !== 0) {
    throw new Error(
      `the removed line ${JSON.stringify(chunkLine)} shows head line ${headLine} instead of 0`,
    )
  }
  if (kind !== 'removed' && headLine === 0) {
    throw new Error(
      `the ${kind} line ${JSON.stringify(chunkLine)} shows head line 0`,
    )
  }

  return { kind, headLine, text }
}

// return the hunk line kind a marker stands for
function toHunkLineKind(marker: string): HunkLineKind {
  if (marker === '+') {
    return 'added'
  }
  if (marker === '-') {
    return 'removed'
  }
  return 'context'
}
