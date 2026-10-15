# pull-request-source Specification

## Purpose
Reads a pull request from GitHub, a local git repository or two directory snapshots into the shared PullRequestSource contract, so the pipeline and the benchmark read every pull request the same way.

## Requirements

### Requirement: Pull request reference parsing
The module SHALL parse a GitHub pull request URL of the form `https://github.com/owner/repo/pull/123` and the short form `owner/repo#123` into a reference with owner, repo, number and the canonical pull request URL. Any other text SHALL be rejected with a typed error.

#### Scenario: Full URL
- **WHEN** `https://github.com/acme/widgets/pull/42` is parsed
- **THEN** the reference has owner `acme`, repo `widgets`, number 42 and url `https://github.com/acme/widgets/pull/42`

#### Scenario: Short form
- **WHEN** `acme/widgets#42` is parsed
- **THEN** the reference equals the one parsed from the full URL

#### Scenario: Invalid text
- **WHEN** `acme/widgets` or `https://github.com/acme/widgets/issues/42` or `acme/widgets#0` is parsed
- **THEN** parsing fails with a typed invalid reference error

### Requirement: Pull request shas from the GitHub API
The module SHALL read a pull request's base sha, head sha, title, author login and HTML URL from the GitHub REST API. It SHALL send an Authorization header only when a token is given.

#### Scenario: Public pull request without a token
- **WHEN** the shas are fetched with no token
- **THEN** the request has no Authorization header and the result holds the five fields from the response

#### Scenario: Token given
- **WHEN** the shas are fetched with a token
- **THEN** the request carries the token as a bearer Authorization header

#### Scenario: Rate limited
- **WHEN** the API answers 403 with no remaining rate limit
- **THEN** the call fails with a typed rate limit error whose message names `GITHUB_TOKEN` as the fix

#### Scenario: Other failure
- **WHEN** the API answers with any other non-success status
- **THEN** the call fails with a typed request error that holds the status

### Requirement: Changed files
A source SHALL list every file that differs between base and head, sorted by path, each with a status of added, modified, deleted or renamed. A rename SHALL be reported only when a file moved with identical content, with the old path as previousPath. A file holding a NUL byte in its first 8000 bytes on either side SHALL be marked binary with no hunks and no added lines.

#### Scenario: Each status
- **WHEN** a pull request adds, edits, deletes and moves one file each
- **THEN** the four files are listed with statuses added, modified, deleted and renamed, and the renamed one has its old path

#### Scenario: Moved and edited
- **WHEN** a file is moved and its content changes
- **THEN** it is listed as a deleted file at the old path and an added file at the new path

#### Scenario: Binary file
- **WHEN** a changed file holds a NUL byte
- **THEN** it is listed with isBinary true, no hunks and no added lines

### Requirement: Hunks
Each text file SHALL carry the unified diff hunks between base and head with 3 lines of context unless the caller sets another count. Within a run of changes, removed lines SHALL come before added lines. Every hunk line SHALL carry its head line number, and a removed line SHALL carry 0.

#### Scenario: Modified line with context
- **WHEN** line 5 of a 10-line file changes
- **THEN** one hunk starts at old and new line 2, holds context lines 2 to 4, the removed line, the added line and context lines 6 to 8, and the added line has head line 5

#### Scenario: Distant changes
- **WHEN** two changes are more than twice the context count apart
- **THEN** they are two hunks, and changes closer than that share one hunk

### Requirement: Added lines
Each text file SHALL carry the head line number and text of every added or modified line, in head line order. These are the lines the pull request introduced.

#### Scenario: Modified and added lines
- **WHEN** a pull request edits line 5 and appends a line 11
- **THEN** addedLines holds line 5 and line 11 with their head text

#### Scenario: Deleted file
- **WHEN** a file is deleted
- **THEN** its addedLines is empty

### Requirement: File contents at base and head
A source SHALL return a file's text at the base or the head revision, and null when the file does not exist in that revision.

#### Scenario: Added file at base
- **WHEN** an added file is read at base
- **THEN** the result is null, and reading it at head returns its text

### Requirement: Head checkout
A source SHALL return a directory holding the head revision's files. The git source SHALL create it as a temporary git worktree, return the same directory on a second call, and remove it on dispose.

#### Scenario: Checkout and dispose
- **WHEN** the head is checked out and the source is then disposed
- **THEN** the directory held the head files and no longer exists after dispose

### Requirement: Git and snapshot equivalence
For the same base and head trees, the git source and the snapshot source SHALL return deep-equal changed files.

#### Scenario: Snapshot committed to git
- **WHEN** a snapshot's base and head trees are committed as two commits of a git repository
- **THEN** both sources list deep-equal changed files

### Requirement: Clone a GitHub pull request
The module SHALL shallow-clone the pull request's repository into a cache directory when it is not there yet, fetch the pull request head ref and the base sha, and return a git source for them. It SHALL work without a token on a public repository, and a token SHALL never be written to the cached repository.

#### Scenario: First clone
- **WHEN** a pull request is cloned into an empty cache directory
- **THEN** the repository is cloned there and the returned source lists the pull request's changed files

#### Scenario: Cached repository
- **WHEN** a second pull request of the same repository is cloned
- **THEN** the existing clone is reused and only the new refs are fetched
