// reads the fenced code blocks out of a markdown text, for the test over the worked examples of the prompt

// the three backticks that open and close a fenced block
const codeFence = '```'

// one fenced block: the info string after its opening fence and the text between its fences
export interface FencedBlock {
  infoString: string
  content: string
}

// a block opened but not yet closed: its info string and the lines read into it so far
interface OpenFencedBlock {
  infoString: string
  lines: string[]
}

// the blocks read so far and the block being filled, when one is open
interface FencedBlockReader {
  fencedBlocks: FencedBlock[]
  openBlock: OpenFencedBlock | null
}

// the text to read and the name of its source for the error
export interface ReadFencedBlocksOptions {
  text: string
  title: string
}

// the blocks to search, the info string to look for and the name of their source for the error
export interface FindFencedBlockOptions {
  fencedBlocks: FencedBlock[]
  infoString: string
  title: string
}

/**
 * Reads every fenced block of a markdown text line by line, and throws naming the source when the last block never closes.
 */
export function readFencedBlocks({
  text,
  title,
}: ReadFencedBlocksOptions): FencedBlock[] {
  // feed every line to the reader in turn
  const fencedBlockReader: FencedBlockReader = {
    fencedBlocks: [],
    openBlock: null,
  }
  for (const textLine of text.split('\n')) {
    readFencedBlockLine(fencedBlockReader, textLine)
  }

  // reject a block still open at the end
  if (fencedBlockReader.openBlock !== null) {
    throw new Error(`${title} has an unterminated fenced block`)
  }

  return fencedBlockReader.fencedBlocks
}

/**
 * Returns the content of the first block with the info string, and throws naming the source when there is none.
 */
export function findFencedBlock({
  fencedBlocks,
  infoString,
  title,
}: FindFencedBlockOptions): string {
  const fencedBlock = fencedBlocks.find(
    (candidateBlock) => candidateBlock.infoString === infoString,
  )
  if (fencedBlock === undefined) {
    throw new Error(
      `${title} has no fenced block with the info string ${JSON.stringify(infoString)}`,
    )
  }
  return fencedBlock.content
}

// open a block at a line that starts with the fence, close the open block at a line that is only the fence, or keep the line inside the open block
function readFencedBlockLine(
  fencedBlockReader: FencedBlockReader,
  textLine: string,
): void {
  // outside a block, skip every line that is not a fence line
  const isOutsideBlock = fencedBlockReader.openBlock === null
  if (isOutsideBlock && !textLine.startsWith(codeFence)) {
    return
  }

  // open a block at a fence line, with the rest of the line as its info string
  if (fencedBlockReader.openBlock === null) {
    fencedBlockReader.openBlock = {
      infoString: textLine.slice(codeFence.length),
      lines: [],
    }
    return
  }

  // close the open block at a line that is only the fence
  if (textLine === codeFence) {
    fencedBlockReader.fencedBlocks.push({
      infoString: fencedBlockReader.openBlock.infoString,
      content: fencedBlockReader.openBlock.lines.join('\n'),
    })
    fencedBlockReader.openBlock = null
    return
  }

  // keep the line inside the open block
  fencedBlockReader.openBlock.lines.push(textLine)
}
