# advisory-store Specification

## Purpose
Keeps a local copy of the OSV npm advisories, refreshed from the bulk export, and serves them by package name so the matcher and the benchmark never query OSV per lookup.

## Requirements

### Requirement: Refresh builds the index and snapshot
A refresh SHALL download the npm bulk export, parse every entry, and write the advisories index keyed by package name and a snapshot under `advisories/npm/` in the cache directory. The snapshot SHALL hold fetchedAt, sourceUrl, entryCount and the sha256 of the downloaded archive.

#### Scenario: Refresh from an archive
- **WHEN** a refresh runs against an archive holding three OSV entries
- **THEN** `advisories/npm/index.json` and `advisories/npm/snapshot.json` exist, entryCount is 3 and sha256 is the digest of the archive bytes

### Requirement: Parse failures fail the refresh
A refresh SHALL fail with an error naming the failing entries when any entry does not parse, and SHALL leave the existing index and snapshot unchanged.

#### Scenario: One malformed entry
- **WHEN** an archive holds a valid entry and an entry whose range type is unknown
- **THEN** the refresh rejects with an error naming the malformed entry and no index is written

### Requirement: OSV entries map onto the advisory contract
Each entry SHALL map to an advisory with id, aliases, summary, details, affected ranges and versions, references, published, modified and withdrawn. Missing lists SHALL become empty lists. `last_affected` SHALL become `lastAffected`.

#### Scenario: Aliases and references
- **WHEN** an entry with two aliases and three references is parsed
- **THEN** the advisory holds both aliases and all three references

#### Scenario: Withdrawn entry
- **WHEN** an entry with a withdrawn timestamp is parsed
- **THEN** the advisory keeps that timestamp in withdrawn

#### Scenario: Last affected range
- **WHEN** an entry whose range has a `last_affected` event is parsed
- **THEN** the advisory range holds that version in lastAffected

#### Scenario: Reference URL without a scheme
- **WHEN** an entry lists the reference URL `github.com/npm/cli`
- **THEN** the advisory holds `https://github.com/npm/cli`

#### Scenario: Entry with no aliases or references
- **WHEN** a malicious-package entry with no aliases and no references is parsed
- **THEN** aliases and references are empty lists

### Requirement: Severity comes from the CVSS entry
The advisory SHALL take its severity vector from the CVSS v3 entry when present, else the CVSS v4 entry, and SHALL set the severity score to the CVSS v3 base score when the vector is v3. With no CVSS entry both SHALL be absent.

#### Scenario: CVSS v3 vector
- **WHEN** an entry has a CVSS v3 vector `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **THEN** the advisory holds that vector and the score 9.8

#### Scenario: CVSS v4 only
- **WHEN** an entry has only a CVSS v4 vector
- **THEN** the advisory holds that vector and no score

### Requirement: GitHub review flag
The advisory SHALL set isGithubReviewed from `database_specific.github_reviewed`, and SHALL set it to false when the field is absent.

#### Scenario: Reviewed, not reviewed and absent
- **WHEN** entries with the flag true, the flag false and no flag are parsed
- **THEN** isGithubReviewed is true, false and false

### Requirement: Lookups by package name
The store SHALL return every advisory whose affected npm packages include the requested name, comparing names after trimming and lowercasing, and SHALL return an empty list for an unknown package.

#### Scenario: Name in another case
- **WHEN** the index holds advisories for `Haraka` and `getByPackage('haraka')` is called
- **THEN** those advisories are returned

#### Scenario: Unknown package
- **WHEN** `getByPackage` is called with a name the index does not hold
- **THEN** it returns an empty list

### Requirement: Snapshot staleness
The module SHALL report whether a snapshot was fetched more than a given number of hours ago.

#### Scenario: Old and fresh snapshots
- **WHEN** a snapshot fetched 25 hours ago and one fetched 1 hour ago are checked against 24 hours
- **THEN** the first is older and the second is not

### Requirement: Committed benchmark subset
The repository SHALL hold an advisory subset in the cache layout under `benchmark/fixtures/advisories` covering lodash, minimist, node-fetch, express, ws, jsonwebtoken, axios, semver, tar, qs, moment, underscore, handlebars, ejs, marked, mustache, xmldom and faker.js, with a snapshot recording the date of the full snapshot it came from. A script SHALL regenerate it from a full cache.

#### Scenario: Lookup over the subset
- **WHEN** the store is loaded from the subset and asked for lodash
- **THEN** it returns lodash advisories and the snapshot names the source snapshot's fetchedAt

### Requirement: Daily refresh workflow
A scheduled workflow SHALL run the refresh daily, fail when the refresh fails, and upload the index and snapshot as a workflow artifact. The full index SHALL never be committed.

#### Scenario: Refresh fails
- **WHEN** an OSV format change makes an entry fail to parse
- **THEN** the workflow run fails
