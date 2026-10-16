# audit module

## Purpose

The per-run JSONL audit log: every event of a review run is redacted and appended as one line to `runs/<runId>/audit.jsonl`, flushed to disk before the write resolves.

## Public API

- `JsonlAuditSinkOptions`: `runId` and an optional `runsDirectory`, default `runs`
- `JsonlAuditSink`: implements `AuditSink`. The constructor creates `<runsDirectory>/<runId>/` and opens `audit.jsonl` there once in append mode, `write(event)` redacts the event, appends it as one JSON line and fsyncs before resolving, `dispose()` closes the descriptor and is safe to call twice, and `filePath` holds the path of the log
- `redact<T>(value: T): T`: returns a deep copy of any value in which every secret-like string is replaced by `sha256:` plus the first 16 lowercase hex characters of the SHA-256 of the original string. A string is secret-like when it starts with a token shape (`ghp_`, `gho_`, `github_pat_`, `sk-ant-`, `sk-`, `AKIA` plus 16 uppercase alphanumerics, `xoxb-`, `xoxp-`, `xoxa-`, or `Bearer ` followed by a token) or when any key on its path matches `/token|secret|password|passwd|api[-_]?key|authorization|credential/i`

## Inputs and outputs

`JsonlAuditSink.write` takes an `AuditEvent` from `@/shared/audit` and writes it to `<runsDirectory>/<runId>/audit.jsonl`, one JSON object per line. `redact` takes any JSON-shaped value and returns a redacted copy of the same shape. Nothing is read back: replaying a log is another module's job.

## Allowed imports

shared

Bun and Node built-ins and npm packages are always allowed.

## Files

- `jsonl-audit-sink.ts`: `JsonlAuditSinkOptions` and `JsonlAuditSink`, the append-and-fsync sink built on `node:fs`
- `jsonl-audit-sink.test.ts`: three events become three lines that pass `auditEventSchema`, the run directory is created, a fake token is redacted on disk, each line is on disk as soon as `write` resolves, a second sink appends instead of truncating, and `dispose` closes the descriptor
- `redact.ts`: `redact`, the token-shape and key-name rules and the sha256 fingerprint
- `redact.test.ts`: a `ghp_` token under `authorization` is fingerprinted with neither the token nor `Bearer` left, equal secrets give equal fingerprints, secret-like keys and token shapes are each caught on their own, ordinary values come back equal and the input is not mutated
- `tsconfig.json`: the module's composite TypeScript project. It references `shared`, this module's row of the matrix
- `AGENTS.md`: this file

## Invariants

- One JSON object per line, every line terminated by a newline, so the file never ends in a partial line.
- Every event is redacted before it is serialized. No unredacted event text reaches the descriptor.
- Every `write` ends with `fsyncSync` on the descriptor, so the line is durable on disk when the promise resolves.
- The log is opened once per sink in append mode, so a second sink for the same run adds to the log instead of replacing it.
- `redact` never mutates its input. It returns a new object and new arrays at every level, and equal secret strings always map to the same fingerprint.
- Appending goes through `node:fs`, the one place it is used over `Bun.file`. `Bun.file(path).writer()` has no append mode and would truncate an existing log.
- The module imports only `@/shared/audit` from `src/`.

## How to test

`bun test src/audit` runs the redaction and sink tests. The sink tests write to a temporary directory from `mkdtempSync` under the OS temp directory and remove it afterwards, so the repository `runs/` directory is never touched. `bun check src/audit/jsonl-audit-sink.ts src/audit/redact.ts` type-checks the module and `bunx biome check src/audit` lints and format-checks it.

## Known gaps

- The token shape list is a heuristic. A token with a prefix outside the list, or a token embedded inside a longer string such as a URL with credentials, is only caught when a key on its path names a secret.
- The key-name rule is a heuristic too. A key like `tokenizer` or `tokenCount` is treated as a secret, and a secret under a key the pattern does not name, such as `pass`, is only caught through its token shape or through a secret-like key above it.
- A redacted string is replaced whole, so a prompt text that holds a token is replaced by one fingerprint instead of keeping the text around the token.
- `redact` walks JSON shapes only. A `Date`, `Map` or `Set` inside a payload comes back as a plain object.
- `write` after `dispose` rejects with the `node:fs` error for a closed descriptor instead of a named error from this module.
