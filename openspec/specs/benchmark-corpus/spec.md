# benchmark-corpus Specification

## Purpose
Holds the labeled pull request cases the reviewer is measured against: synthetic modifications of one fixture app and real-world fixes reversed, each with the findings it expects and the split it belongs to.

## Requirements

### Requirement: One directory per case
Every case SHALL live at `benchmark/cases/<id>/` with a `case.json` that parses against the shared benchmark case contract, where `<id>` equals the case's `id` field. A snapshot case SHALL hold full `base/` and `head/` directories there and its source `dir` SHALL name that case directory. A git case SHALL record its clone url and both shas and hold no snapshot directories.

#### Scenario: Case parses
- **WHEN** every `case.json` under `benchmark/cases` is read
- **THEN** each parses against the benchmark case contract and its `id` equals its directory name

#### Scenario: Snapshot head differs from base
- **WHEN** a snapshot case is validated
- **THEN** at least one file differs between its `base/` and `head/` directories

#### Scenario: Git case has no snapshot
- **WHEN** a git case is validated
- **THEN** it has a clone url and base and head shas and no `base/` or `head/` directory

### Requirement: Synthetic cases derive from the fixture app
Every snapshot case's `base/` SHALL be the fixture app under `benchmark/fixtures/app` with at most the changes the case description names, and its `head/` SHALL be `base/` plus the one change the case labels. The fixture app SHALL ship a `bun.lock` and a `package-lock.json` that resolve the same packages at the same versions, and every package in them SHALL have its advisories in the advisory fixture.

#### Scenario: Lockfiles agree
- **WHEN** the fixture app's two lockfiles are read
- **THEN** they resolve the same set of package names and versions

#### Scenario: Every fixture package has advisory coverage
- **WHEN** a package name appears in either fixture lockfile
- **THEN** the advisory fixture holds at least one advisory affecting that package name, or the package is listed in the fixture's known-clean list

### Requirement: Category coverage
The corpus SHALL hold exactly 12 dependency cases (category `sca`), 15 code cases, 4 secrets cases, 15 clean cases and 8 real-world cases, each covering the situation its description names, and the corpus SHALL be validated against those counts.

#### Scenario: Counts by category
- **WHEN** the corpus is validated
- **THEN** it reports 12 sca, 15 code, 4 secrets, 15 clean and 8 real-world cases

#### Scenario: Dependency cases cover the matcher edges
- **WHEN** the sca cases are listed
- **THEN** one each covers a direct prod bump, a dev bump, a transitive-only change, a last-affected-only range, a versions-only listing, a withdrawn advisory, an advisory GitHub did not review, a vulnerable package never imported, a package imported through a subpath, a change to `bun.lock` only, a change to `package-lock.json` only, and a bump to a fixed version

#### Scenario: Code cases label one weakness each
- **WHEN** a code case is read
- **THEN** it expects exactly one code-review finding with a CWE, a file and a line range that lies within the lines its head adds

#### Scenario: Clean cases expect nothing
- **WHEN** a clean case, a withdrawn-advisory case or a fixed-version case is read
- **THEN** `isClean` is true and its expected findings are empty

### Requirement: Labels say what a detector must report
An expected finding SHALL name its detector and only the fields the matching rules use: package name and advisory id for a dependency finding, CWE with file and line range for a code finding, file and line for a secret finding, and advisory id with CWE, file and line range for a real-world finding.

#### Scenario: Dependency label
- **WHEN** an sca expected finding is read
- **THEN** it has a package name and an advisory id

#### Scenario: Secret label
- **WHEN** a secrets expected finding is read
- **THEN** it has a file and a start line

### Requirement: Dev and test split
Every case SHALL record a split of `dev` or `test`. Within each category about 70 percent of the cases SHALL be `dev` and the rest `test`, and the validator SHALL report the counts by split. The test split is never used for tuning.

#### Scenario: Counts by split
- **WHEN** the corpus is validated
- **THEN** it reports the dev and test counts per category and every category has at least one case in each split

### Requirement: Real-world cases reverse a fix
A real-world case SHALL point at a public npm package repository where an advisory in the fixture lists a fix commit, with the fix commit as the base and its parent as the head, and SHALL expect one code-review finding labeled with the advisory id and CWE.

#### Scenario: Real-world label
- **WHEN** a real-world case is read
- **THEN** its source is a git source, its expected finding has an advisory id present in the advisory fixture and a CWE, and the advisory's references include a fix url that names the base sha

### Requirement: Corpus validation command
`bun run benchmark:validate` SHALL load every case, apply every check above, print the counts by category and by split, and exit non-zero naming each case that fails a check.

#### Scenario: Clean corpus
- **WHEN** the command runs on the checked-in corpus
- **THEN** it prints the counts and exits with status 0

#### Scenario: Broken case
- **WHEN** a case directory holds a `case.json` whose `id` differs from the directory name
- **THEN** the command names that case and exits non-zero

### Requirement: Fixture code passes the repository checks
Every `.ts` file under `benchmark/` SHALL start with the file header comment and pass the formatter. The linter SHALL be off under `benchmark/`, so a deliberately vulnerable case is not a lint failure.

#### Scenario: Verify passes with the corpus present
- **WHEN** `bun run verify` runs with the corpus checked in
- **THEN** the header check and the format check report no file under `benchmark/`
