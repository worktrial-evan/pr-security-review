// scans a checkout once with ts-morph for syntax only and maps each imported npm package to the files importing it
import { relative, sep } from 'node:path'
import { Node, Project, type SourceFile, SyntaxKind } from 'ts-morph'
import type { AuditSink } from '@/shared/audit'
import { toPackageName } from './package-specifier'
import { listSourceFiles } from './source-files'

// the most files one scan reads unless the caller sets its own cap
export const defaultMaxFileCount = 10_000

// the step name on the audit event a scan writes
export const reachabilityAuditStep = 'reachability'

// the root-relative paths of the files importing each package, keyed by package name in name order
export type ImportsByPackage = Map<string, string[]>

// the checkout to scan, where the scan is audited and the most files it reads
export interface CollectImportsOptions {
  rootDir: string
  auditSink: AuditSink
  runId: string
  maxFileCount?: number
}

// the imports found, how many files were parsed, how long it took and anything the scan skipped
export interface ImportCollection {
  imports: ImportsByPackage
  fileCount: number
  parseDurationMs: number
  warnings: string[]
}

/**
 * Scans the source files under rootDir once and returns the files importing each npm package.
 */
export async function collectImports({
  rootDir,
  auditSink,
  runId,
  maxFileCount = defaultMaxFileCount,
}: CollectImportsOptions): Promise<ImportCollection> {
  const startedAt = performance.now()

  // list the files the scan may read and warn when the cap cut the list short
  const sourceFileListing = await listSourceFiles({ rootDir, maxFileCount })
  const warnings = [...sourceFileListing.warnings]
  if (sourceFileListing.isFileCapReached) {
    warnings.push(
      `stopped at the file cap of ${maxFileCount} files, so imports in later files are missing`,
    )
  }

  // parse every file and record the packages it imports
  const importingFilesByPackage = await readImportingFiles({
    filePaths: sourceFileListing.filePaths,
    realRootDir: sourceFileListing.realRootDir,
    warnings,
  })
  const imports = toImportsByPackage(importingFilesByPackage.importingFiles)
  const fileCount = importingFilesByPackage.parsedFileCount
  const parseDurationMs = performance.now() - startedAt

  // record what the scan cost
  await auditSink.write({
    timestamp: new Date().toISOString(),
    runId,
    step: reachabilityAuditStep,
    kind: 'note',
    payload: {
      fileCount,
      parseDurationMs,
      maxFileCount,
      isFileCapReached: sourceFileListing.isFileCapReached,
      warnings,
    },
    durationMs: parseDurationMs,
  })

  return { imports, fileCount, parseDurationMs, warnings }
}

// the files to parse, the resolved root their paths are made relative to and the warnings to add to
interface ReadImportingFilesOptions {
  filePaths: string[]
  realRootDir: string
  warnings: string[]
}

// the files importing each package as an unordered set, and how many files were parsed
interface ImportingFiles {
  importingFiles: Map<string, Set<string>>
  parsedFileCount: number
}

// parse each file in an in-memory project and collect the packages its specifiers name
async function readImportingFiles({
  filePaths,
  realRootDir,
  warnings,
}: ReadImportingFilesOptions): Promise<ImportingFiles> {
  const project = createSyntaxOnlyProject()
  const importingFiles = new Map<string, Set<string>>()
  let parsedFileCount = 0

  for (const filePath of filePaths) {
    // read the text, skipping a file that cannot be read
    const fileText = await readFileText({ filePath, warnings })
    if (fileText === null) {
      continue
    }

    // parse the file and map each specifier to its package
    const sourceFile = project.createSourceFile(filePath, fileText, {
      overwrite: true,
    })
    const relativePath = relative(realRootDir, filePath).split(sep).join('/')
    for (const moduleSpecifier of listModuleSpecifiers(sourceFile)) {
      addImportingFile({ importingFiles, moduleSpecifier, relativePath })
    }

    // drop the syntax tree once its imports are recorded
    project.removeSourceFile(sourceFile)
    parsedFileCount += 1
  }
  return { importingFiles, parsedFileCount }
}

// build a project that reads no tsconfig, resolves no import and never touches the disk
function createSyntaxOnlyProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, noResolve: true },
  })
}

// the file to read and the warnings to add to when it cannot be read
interface ReadFileTextOptions {
  filePath: string
  warnings: string[]
}

// read one file as text, recording a warning instead of failing when it cannot be read
async function readFileText({
  filePath,
  warnings,
}: ReadFileTextOptions): Promise<string | null> {
  try {
    return await Bun.file(filePath).text()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`skipped an unreadable file: ${message}`)
    return null
  }
}

// list the specifiers of every runtime import in a file: import and export-from declarations, import-equals, import() and require()
function listModuleSpecifiers(sourceFile: SourceFile): string[] {
  const moduleSpecifiers: string[] = []

  // collect import declarations that are not type-only
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (!importDeclaration.isTypeOnly()) {
      moduleSpecifiers.push(importDeclaration.getModuleSpecifierValue())
    }
  }

  // collect export-from declarations that are not type-only
  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const moduleSpecifier = exportDeclaration.getModuleSpecifierValue()
    if (moduleSpecifier !== undefined && !exportDeclaration.isTypeOnly()) {
      moduleSpecifiers.push(moduleSpecifier)
    }
  }

  // collect import-equals requires that are not type-only
  for (const importEquals of sourceFile.getDescendantsOfKind(
    SyntaxKind.ImportEqualsDeclaration,
  )) {
    const moduleReference = importEquals.getModuleReference()
    if (
      Node.isExternalModuleReference(moduleReference) &&
      !importEquals.isTypeOnly()
    ) {
      pushLiteralText({
        node: moduleReference.getExpression(),
        moduleSpecifiers,
      })
    }
  }

  // collect import() and require() calls whose first argument is a literal
  for (const callExpression of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const callee = callExpression.getExpression()
    const isDynamicImport = callee.getKind() === SyntaxKind.ImportKeyword
    const isRequire =
      Node.isIdentifier(callee) && callee.getText() === 'require'
    if (isDynamicImport || isRequire) {
      pushLiteralText({
        node: callExpression.getArguments()[0],
        moduleSpecifiers,
      })
    }
  }
  return moduleSpecifiers
}

// the node that may hold a literal specifier and the list to add it to
interface PushLiteralTextOptions {
  node: Node | undefined
  moduleSpecifiers: string[]
}

// add a string literal or a template literal without substitutions to the specifiers
function pushLiteralText({
  node,
  moduleSpecifiers,
}: PushLiteralTextOptions): void {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    moduleSpecifiers.push(node.getLiteralValue())
  }
}

// the map to add to, the specifier found and the file it was found in
interface AddImportingFileOptions {
  importingFiles: Map<string, Set<string>>
  moduleSpecifier: string
  relativePath: string
}

// record the file under the package a specifier names, ignoring a specifier that names none
function addImportingFile({
  importingFiles,
  moduleSpecifier,
  relativePath,
}: AddImportingFileOptions): void {
  const packageName = toPackageName(moduleSpecifier)
  if (packageName === null) {
    return
  }
  const packageFiles = importingFiles.get(packageName) ?? new Set<string>()
  packageFiles.add(relativePath)
  importingFiles.set(packageName, packageFiles)
}

// sort the packages by name and each package's files by path
function toImportsByPackage(
  importingFiles: Map<string, Set<string>>,
): ImportsByPackage {
  const sortedPackageNames = [...importingFiles.keys()].sort()
  const imports: ImportsByPackage = new Map()
  for (const packageName of sortedPackageNames) {
    const packageFiles = importingFiles.get(packageName) ?? new Set<string>()
    imports.set(packageName, [...packageFiles].sort())
  }
  return imports
}
