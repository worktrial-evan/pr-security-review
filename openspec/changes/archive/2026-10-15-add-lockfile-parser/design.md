# Design

## Context

See proposal.md for motivation and the settled open details. The contract is `src/shared/dependency.ts` as it stands. `bun.lock` maps a package key to a tuple whose first element is `name@specifier`, and nests a copy under its parent as `parent/child`. `package-lock.json` maps an install path such as `node_modules/a/node_modules/b` to an entry, and a linked entry points at a folder entry by path.

## Goals / Non-Goals

**Goals:**

- Both formats go through one shared builder, so scope, direct flags, merging and ordering cannot differ between them.
- Adding a lockfile kind is one parser file plus one registry entry.

**Non-Goals:**

- Reading workspace package.json files from disk. Workspace dependencies come from the lockfile itself.
- Honoring npm's own `dev` and `optional` flags. Scope is computed the same way for both formats.

## Decisions

### D1. Parsers return install nodes, one builder makes the set

Each parser returns a list of nodes, one per install location, holding name, version, optional real package name, workspace flag and the locations its dependencies resolve to. It also returns the root's production, dev and direct locations. A builder walks those nodes breadth-first for scope, merges nodes with the same `name@version`, and emits the `Map` and `Set` in sorted order. Alternative was each parser building the set itself, rejected because the scope and merge rules would exist twice.

### D2. Dependency resolution follows each format's nesting

`bun.lock` resolves a dependency `d` of key `a/b` by trying `a/b/d`, then `a/d`, then `d`, splitting keys so `@scope/name` stays one segment. `package-lock.json` tries `<location>/node_modules/d` and walks up one `node_modules` level at a time to `node_modules/d`. A dependency that resolves nowhere, such as an uninstalled optional peer, is skipped.

### D3. Registry keyed by file name

`lockfile-registry.ts` maps `bun.lock` and `package-lock.json` to their kind and parser, and lists `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` and `npm-shrinkwrap.json` as known but unsupported. `detectLockfiles` returns a discriminated union per matched path: supported with its kind, or unsupported with its file name. `parseLockfile` looks the parser up by kind.

### D4. Workspaces and links

In `bun.lock` a `workspace:` specifier marks a workspace, and its dependencies come from the `workspaces` map entry with the same path. In `package-lock.json` a linked entry is a workspace when its target matches a glob in the root entry's `workspaces`, and otherwise a `file:` link. Workspace versions are `workspace:<path>` in both formats, so a diff across formats compares like with like.

### D5. One error class

`LockfileParseError`, in its own file, has `lockfileKind` and a `reason`: unsupported-version or malformed. Malformed covers invalid JSON, a shape that fails the zod schema, and an npm entry without a version.

## Risks / Trade-offs

- [Lockfile shapes not covered by fixtures, such as bun tarball URLs or npm bundled dependencies] → Unknown specifiers keep their string and are marked unparseable. Unknown entry fields are ignored.
- [Treating unreachable entries as prod adds noise for orphan entries] → Over-reporting is safer than hiding a vulnerable production dependency.
