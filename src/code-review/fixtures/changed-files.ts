// the sample changed files for the code review tests: one per skip rule, one weakness, one wide context, one rename, the list of them, the context lines every test renders at and a builder for large files
import type {
  AddedLine,
  ChangedFile,
  Hunk,
  HunkLine,
} from '@/shared/pull-request-source'

// the context lines every test renders at
export const testContextLines = 30

// a modified handler that builds a SQL string from a request parameter on its second added line
export const sqlInjectionChangedFile: ChangedFile = {
  path: 'src/users/find-user.ts',
  status: 'modified',
  hunks: [
    {
      oldStart: 12,
      oldLines: 5,
      newStart: 12,
      newLines: 7,
      lines: [
        {
          kind: 'context',
          headLine: 12,
          text: 'export async function findUser(request: HttpRequest): Promise<HttpResponse> {',
        },
        {
          kind: 'context',
          headLine: 13,
          text: '  const database = await connectDatabase()',
        },
        {
          kind: 'added',
          headLine: 14,
          text: '  const userId = request.query.id',
        },
        {
          kind: 'added',
          headLine: 15,
          text: '  const rows = await database.query("SELECT * FROM users WHERE id = " + userId)',
        },
        {
          kind: 'context',
          headLine: 16,
          text: '  if (rows.length === 0) {',
        },
        { kind: 'context', headLine: 17, text: '    return notFound()' },
        { kind: 'context', headLine: 18, text: '  }' },
      ],
    },
  ],
  addedLines: [
    { line: 14, text: '  const userId = request.query.id' },
    {
      line: 15,
      text: '  const rows = await database.query("SELECT * FROM users WHERE id = " + userId)',
    },
  ],
  isBinary: false,
}

// a settings loader with 40 context lines on each side of one added line at head line 41
export const wideContextChangedFile: ChangedFile = {
  path: 'src/config/load-settings.ts',
  status: 'modified',
  hunks: [
    {
      oldStart: 1,
      oldLines: 80,
      newStart: 1,
      newLines: 81,
      lines: [
        ...buildSettingContextLines({ firstHeadLine: 1, lineCount: 40 }),
        {
          kind: 'added',
          headLine: 41,
          text: "export const isTracingEnabled = readSetting('tracing') === 'on'",
        },
        ...buildSettingContextLines({ firstHeadLine: 42, lineCount: 40 }),
      ],
    },
  ],
  addedLines: [
    {
      line: 41,
      text: "export const isTracingEnabled = readSetting('tracing') === 'on'",
    },
  ],
  isBinary: false,
}

// a renamed request parser whose one hunk holds a context, a removed, an added and a context line
export const renamedChangedFile: ChangedFile = {
  path: 'src/http/parse-request.ts',
  status: 'renamed',
  previousPath: 'src/http/request-parser.ts',
  hunks: [
    {
      oldStart: 4,
      oldLines: 3,
      newStart: 4,
      newLines: 3,
      lines: [
        {
          kind: 'context',
          headLine: 4,
          text: 'export function parseRequest(rawRequest: string): ParsedRequest {',
        },
        {
          kind: 'removed',
          headLine: 0,
          text: '  const headerText = rawRequest.split("\\r\\n\\r\\n")[0]',
        },
        {
          kind: 'added',
          headLine: 5,
          text: "  const headerText = rawRequest.split('\\r\\n\\r\\n')[0] ?? ''",
        },
        {
          kind: 'context',
          headLine: 6,
          text: '  return { headers: parseHeaders(headerText) }',
        },
      ],
    },
  ],
  addedLines: [
    {
      line: 5,
      text: "  const headerText = rawRequest.split('\\r\\n\\r\\n')[0] ?? ''",
    },
  ],
  isBinary: false,
}

// a replaced image with no hunks and no added lines
export const binaryChangedFile: ChangedFile = {
  path: 'assets/logo.png',
  status: 'modified',
  hunks: [],
  addedLines: [],
  isBinary: true,
}

// a deleted handler whose one hunk removes every line
export const deletedChangedFile: ChangedFile = {
  path: 'src/legacy/old-handler.ts',
  status: 'deleted',
  hunks: [
    {
      oldStart: 1,
      oldLines: 3,
      newStart: 0,
      newLines: 0,
      lines: [
        {
          kind: 'removed',
          headLine: 0,
          text: 'export function handleLegacyRequest(request: HttpRequest): HttpResponse {',
        },
        { kind: 'removed', headLine: 0, text: '  return ok(request.body)' },
        { kind: 'removed', headLine: 0, text: '}' },
      ],
    },
  ],
  addedLines: [],
  isBinary: false,
}

// the bun lockfile with one added package entry
export const lockfileChangedFile: ChangedFile = {
  path: 'bun.lock',
  status: 'modified',
  hunks: [
    {
      oldStart: 40,
      oldLines: 2,
      newStart: 40,
      newLines: 3,
      lines: [
        {
          kind: 'context',
          headLine: 40,
          text: '    "ansi-colors": ["ansi-colors@4.1.3", "", {}, "sha512-example"],',
        },
        {
          kind: 'added',
          headLine: 41,
          text: '    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-example"],',
        },
        {
          kind: 'context',
          headLine: 42,
          text: '    "semver": ["semver@7.8.5", "", {}, "sha512-example"],',
        },
      ],
    },
  ],
  addedLines: [
    {
      line: 41,
      text: '    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-example"],',
    },
  ],
  isBinary: false,
}

// a minified bundle under dist with one added line
export const generatedChangedFile: ChangedFile = {
  path: 'dist/app.min.js',
  status: 'modified',
  hunks: [
    {
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: 1,
      lines: [
        {
          kind: 'added',
          headLine: 1,
          text: '!function(e){e.start=function(){return 1}}(window.app={});',
        },
      ],
    },
  ],
  addedLines: [
    {
      line: 1,
      text: '!function(e){e.start=function(){return 1}}(window.app={});',
    },
  ],
  isBinary: false,
}

// a modified metrics reporter whose one hunk only removes lines
export const removedOnlyChangedFile: ChangedFile = {
  path: 'src/metrics/report-usage.ts',
  status: 'modified',
  hunks: [
    {
      oldStart: 8,
      oldLines: 4,
      newStart: 8,
      newLines: 2,
      lines: [
        {
          kind: 'context',
          headLine: 8,
          text: 'export function reportUsage(usage: Usage): void {',
        },
        {
          kind: 'removed',
          headLine: 0,
          text: '  console.log("input tokens: " + usage.inputTokens)',
        },
        {
          kind: 'removed',
          headLine: 0,
          text: '  console.log("output tokens: " + usage.outputTokens)',
        },
        { kind: 'context', headLine: 9, text: '  metrics.record(usage)' },
      ],
    },
  ],
  addedLines: [],
  isBinary: false,
}

// the eight named fixtures, in declaration order
export const namedChangedFiles: ChangedFile[] = [
  sqlInjectionChangedFile,
  wideContextChangedFile,
  renamedChangedFile,
  binaryChangedFile,
  deletedChangedFile,
  lockfileChangedFile,
  generatedChangedFile,
  removedOnlyChangedFile,
]

// how many hunks a large file holds and how many added lines each hunk holds
export interface BuildLargeChangedFileOptions {
  hunkCount: number
  linesPerHunk: number
}

// the unchanged lines between two hunks of a large file
const largeFileHunkGap = 10

/**
 * Builds a modified route file whose hunks each add linesPerHunk lines, with head line numbers continuing across hunks after a gap of ten.
 */
export function buildLargeChangedFile({
  hunkCount,
  linesPerHunk,
}: BuildLargeChangedFileOptions): ChangedFile {
  // the hunks and the added lines the file collects
  const hunks: Hunk[] = []
  const addedLines: AddedLine[] = []

  // add one all-added hunk per count, each starting after the gap that follows the hunk before it
  for (let hunkIndex = 0; hunkIndex < hunkCount; hunkIndex += 1) {
    const firstHeadLine = hunkIndex * (linesPerHunk + largeFileHunkGap) + 1
    const hunk = buildAddedRouteHunk({
      firstHeadLine,
      lineCount: linesPerHunk,
      oldStart: hunkIndex * largeFileHunkGap + 1,
    })
    hunks.push(hunk)
    addedLines.push(...toAddedLines(hunk.lines))
  }

  return {
    path: 'src/api/routes.ts',
    status: 'modified',
    hunks,
    addedLines,
    isBinary: false,
  }
}

/**
 * Returns the added lines among hunk lines in the added line shape, each with its head line as the line.
 */
export function toAddedLines(hunkLines: HunkLine[]): AddedLine[] {
  const addedHunkLines = hunkLines.filter(
    (hunkLine) => hunkLine.kind === 'added',
  )
  return addedHunkLines.map((hunkLine) => ({
    line: hunkLine.headLine,
    text: hunkLine.text,
  }))
}

// where a run of generated lines starts and how many lines it holds
interface BuildLinesOptions {
  firstHeadLine: number
  lineCount: number
}

// build consecutive context lines that each read one setting
function buildSettingContextLines({
  firstHeadLine,
  lineCount,
}: BuildLinesOptions): HunkLine[] {
  const contextHunkLines: HunkLine[] = []
  for (let offset = 0; offset < lineCount; offset += 1) {
    const headLine = firstHeadLine + offset
    contextHunkLines.push({
      kind: 'context',
      headLine,
      text: `export const setting${headLine} = readSetting('setting-${headLine}')`,
    })
  }
  return contextHunkLines
}

// where an all-added route hunk starts in the head and in the base
interface BuildAddedRouteHunkOptions extends BuildLinesOptions {
  oldStart: number
}

// build one hunk that adds consecutive route registrations
function buildAddedRouteHunk({
  firstHeadLine,
  lineCount,
  oldStart,
}: BuildAddedRouteHunkOptions): Hunk {
  const hunkLines: HunkLine[] = []
  for (let offset = 0; offset < lineCount; offset += 1) {
    const headLine = firstHeadLine + offset
    hunkLines.push({
      kind: 'added',
      headLine,
      text: `router.get('/items/${headLine}', listItems)`,
    })
  }
  return {
    oldStart,
    oldLines: 0,
    newStart: firstHeadLine,
    newLines: lineCount,
    lines: hunkLines,
  }
}
