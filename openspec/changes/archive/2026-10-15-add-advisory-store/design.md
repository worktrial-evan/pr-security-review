# Design

## Context

The npm export is a 218 MB zip with about 230,000 JSON entries, 386 MB unzipped. About 222,000 of them are malicious-package (`MAL-`) entries. `src/advisories` may import only `src/shared`. The `Advisory` and `AdvisoryStore` contracts are frozen.

## Goals / Non-Goals

**Goals:** one parse path shared by the refresh and the tests, an index that loads with one `JSON.parse`, and storage hidden behind `loadAdvisoryStore` so a `bun:sqlite` store can replace the JSON file without touching callers.

**Non-Goals:** version range matching, incremental refresh, other ecosystems.

## Decisions

- **Two-step parse.** A loose zod schema reads the OSV fields this module uses and ignores the rest. The mapped value is then checked against `advisorySchema`. The refresh collects every failure and throws one error listing them, so the canary shows all drift at once.
- **Index layout.** `index.json` maps each normalized npm name to its advisories. An advisory that affects several npm packages is stored under each one. Duplication beats a second id table because a lookup stays one property read.
- **Atomic write.** The index and snapshot are written to temporary files and renamed into place, so a failed refresh leaves the old cache intact.
- **Validation on read.** Loading the full index does not re-validate 230,000 advisories. `getByPackage` parses the advisories it returns through `advisorySchema`, so every value that leaves the store is checked at the boundary.
- **Testable refresh.** `refreshAdvisories` takes an optional `sourceUrl`. Tests zip parse fixtures with `fflate`, serve the archive from `Bun.serve` and refresh from it, so the full path runs offline.
- **CVSS score.** `cvss.ts` computes the CVSS 3.x base score. CVSS v4 scoring needs lookup tables and is left out.
- **Subset layout.** The subset mirrors the cache layout at `benchmark/fixtures/advisories/npm/`. The benchmark points `loadAdvisoryStore` at `benchmark/fixtures` and needs no second loader. The regeneration script formats the files with Biome so `biome check` passes.
- **Commands.** `refresh-advisories-command.ts` and `write-advisory-subset.ts` are entry files under `src/advisories` guarded by `import.meta.main`, so a later `cli` change can call the same functions.

## Risks / Trade-offs

- [The full index is large, so loading it takes seconds and a lot of memory] → The load time is measured and recorded in `AGENTS.md`. The benchmark loads the small subset. A `bun:sqlite` store is the planned replacement.
- [Lowercasing merges names that differ only in case] → The returned advisories keep the exact names, so the matcher can still compare exactly.
- [A strict canary fails on harmless drift] → That is the intended behavior. The error names the entries, so the fix is quick.
