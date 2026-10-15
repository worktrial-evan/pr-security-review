# lockfile-parsing Specification

## Purpose
Turns the lockfiles a pull request touches into dependency sets, so later stages can see which package versions the pull request introduces and how each one is reached.

## Requirements

### Requirement: Lockfile detection
The system SHALL pick the lockfiles out of a list of file paths by file name. A supported lockfile SHALL be reported with its kind. A known but unsupported lockfile SHALL be reported as unsupported, never as an error. Any other path SHALL be ignored.

#### Scenario: Supported and unsupported lockfiles in one list
- **WHEN** the list holds `bun.lock`, `web/package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` and `src/index.ts`
- **THEN** `bun.lock` is reported as kind bun, `web/package-lock.json` as kind npm, the pnpm and yarn files as unsupported, and `src/index.ts` is not reported

### Requirement: Lockfile parsing into a dependency set
The system SHALL parse `bun.lock`, including trailing commas, and `package-lock.json` versions 2 and 3 into a dependency set holding every resolved version with its name, exact version, scope, direct flag, workspace flag and the keys of the versions it depends on.

#### Scenario: Same package at several versions
- **WHEN** a lockfile holds a package at the top level and an older copy nested under another package
- **THEN** both versions appear under that package name, and the dependent's keys point at the nested version

#### Scenario: Scoped package
- **WHEN** a lockfile holds `@acme/logger`
- **THEN** it appears under the name `@acme/logger`

### Requirement: Unsupported lockfile version rejected
The system SHALL reject a `package-lock.json` whose version is 1 or above 3, and a `bun.lock` whose version it does not know, with a typed error naming the version. Malformed content SHALL be rejected with the same error type.

#### Scenario: npm lockfile version 1
- **WHEN** a `package-lock.json` with `lockfileVersion` 1 is parsed
- **THEN** a typed lockfile error with reason unsupported-version is thrown

### Requirement: Direct dependencies and scope
A version SHALL be direct when the root package.json lists its name under dependencies, devDependencies, optionalDependencies or peerDependencies and the root resolves that name to it. A version SHALL have scope dev only when it is reachable from the root's devDependencies and not from any production root.

#### Scenario: Dev-only and shared dependencies
- **WHEN** a dev dependency and a production dependency both depend on one package, and the dev dependency also depends on a second package
- **THEN** the shared package is prod, the second package is dev, and optional and peer dependencies of the root are direct and prod

### Requirement: Specifiers that are not registry versions
An npm alias SHALL keep the alias as its name and the aliased package as its real package name. A workspace package SHALL be marked as a workspace. A git, file, link or tarball dependency SHALL keep its specifier as the version. Every version that is not valid semver SHALL be marked unparseable.

#### Scenario: Alias, workspace and git
- **WHEN** a lockfile holds an alias `lodash-legacy` of `lodash`, a workspace package and a git dependency
- **THEN** the alias has real package name `lodash`, the workspace has the workspace flag set, and the git dependency's version is its specifier with the unparseable flag set

### Requirement: Deterministic sorted projection
The system SHALL project a dependency set to a flat list sorted by name, then by semver ascending, with versions that are not semver after the semver ones in string order. The same input SHALL always give the same list.

#### Scenario: Parsing twice gives the same result
- **WHEN** the same lockfile is parsed twice
- **THEN** both dependency sets and both projections are deep-equal

### Requirement: Dependency diff
The system SHALL diff a base and a head dependency set into added, removed and changed versions and a count of unchanged versions. A pull request introduces only the added and changed entries.

#### Scenario: One added, one bumped, one removed
- **WHEN** the head adds a package, bumps a second and drops a third, and leaves a fourth alone
- **THEN** the diff has one added, one changed with both versions, one removed and an unchanged count of one

### Requirement: Shortest dependency path
The system SHALL find the shortest chain of name@version keys from a direct dependency to a named package by breadth-first search, matching the package by name or real package name, and SHALL return an empty list when nothing reaches it.

#### Scenario: Transitive dependency
- **WHEN** a direct dev dependency depends on a package that depends on the target
- **THEN** the path lists the direct dependency, the middle package and the target, in that order

### Requirement: Package names stay exact
The system SHALL record every package under the exact name the lockfile installs it as, with its case unchanged. Two names that differ only in case SHALL stay two separate packages.

#### Scenario: Names that differ only in case
- **WHEN** a package-lock.json installs both `JSONStream` and `jsonstream`
- **THEN** the dependency set lists both names, each with its own version
