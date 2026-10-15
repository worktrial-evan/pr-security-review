## Purpose

Decides how a vulnerable npm package is reached from the head checkout: imported by the code, declared but never imported, or only pulled in through another package.

## ADDED Requirements

### Requirement: Import collection over a checkout
The system SHALL scan every file with a ts, tsx, mts, cts, js, jsx, mjs or cjs extension under a root directory and return, for each npm package, the root-relative paths of the files importing it. It SHALL count import declarations, export-from declarations, dynamic `import()` and `require()` calls with a string literal argument, and SHALL ignore type-only imports and exports.

#### Scenario: Every import form
- **WHEN** the checkout imports packages by default, named, namespace and side-effect import, by export-from, by dynamic import and by require
- **THEN** each of those packages maps to the files that import it

#### Scenario: Computed specifier
- **WHEN** a file calls `import()` or `require()` with a non-literal argument
- **THEN** that call adds no package

### Requirement: Specifier to package name
The system SHALL map a module specifier to its npm package name. A scoped package SHALL keep its scope, and a subpath SHALL map to its root package. Node and Bun builtins, with or without a `node:` prefix, relative paths and alias paths SHALL map to no package.

#### Scenario: Subpath and scoped specifiers
- **WHEN** files import `lodash/merge` and `@acme/logger/format`
- **THEN** they count as imports of `lodash` and `@acme/logger`

#### Scenario: Builtins and local paths
- **WHEN** files import `node:fs`, `fs/promises`, `bun:sqlite`, `./local`, `../parent`, `@/alias`, `~/alias` and `#internal`
- **THEN** none of them adds a package

### Requirement: Safe and bounded scan
The system SHALL skip `node_modules`, `dist`, `build`, `coverage`, `cache` and `runs` directories, SHALL never follow a symbolic link, and SHALL never read a file whose real path is outside the root. It SHALL read file text for syntax only, without resolving modules or types.

#### Scenario: Excluded directory and symbolic link
- **WHEN** the root holds a `node_modules` package and a symbolic link to a directory outside the root, both importing a package
- **THEN** that package is not reported

### Requirement: File cap
The system SHALL stop scanning once it has read a configurable number of files and SHALL report a warning, returning the imports found so far.

#### Scenario: Cap reached
- **WHEN** the cap is lower than the number of source files
- **THEN** exactly the cap's number of files are scanned and a warning names the cap

### Requirement: Scan audit
The system SHALL write one audit event per scan holding the scanned file count, the parse time and any warnings.

#### Scenario: Audit after a scan
- **WHEN** a scan finishes
- **THEN** the audit sink receives an event with the file count and parse time

### Requirement: Reachability classification
The system SHALL classify a package from one scan's imports, the dependency set and the dependency graph. A package any file imports SHALL be direct-imported with the importing files. A direct dependency no file imports SHALL be direct-unused. Any other package SHALL be transitive. Every classification SHALL include the graph's shortest path from a direct dependency.

#### Scenario: Imported direct dependency
- **WHEN** a direct dependency is imported by two files
- **THEN** it is direct-imported with both files in importedBy

#### Scenario: Unused direct dependency
- **WHEN** a direct dependency is imported by no file
- **THEN** it is direct-unused with an empty importedBy

#### Scenario: Transitive dependency
- **WHEN** a package is reached only through a direct dependency
- **THEN** it is transitive with the dependency path from that direct dependency down to the package
