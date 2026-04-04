# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build         # Bundle src/index.ts → dist/index.js (rolldown, minified ESM with shebang)
pnpm check         # Biome lint + format check
pnpm check:fix     # Biome auto-fix
pnpm typecheck     # TypeScript type-check only (no emit)
pnpm test          # Run all tests once (vitest)
pnpm test:watch    # Vitest in watch mode
pnpm depcat        # Build and run the CLI
```

Run a single test file:
```bash
pnpm vitest run test/workspace.test.ts
```

## Architecture

| Module | Responsibility |
|--------|---------------|
| `src/index.ts` | CLI entry: arg parsing, workspace lookup, orchestration, interactive resolution |
| `src/types.ts` | Shared type definitions only |
| `src/workspace.ts` | `parseWorkspace()` → `{ patterns, catalogMap }` |
| `src/sync.ts` | `findPackageJsons()` + `syncPackageJson()` |
| `src/output.ts` | All `console.log` output with picocolors styling |

### Key type: `CatalogMap`

```ts
type CatalogEntry =
  | { kind: 'unique'; ref: string }               // appears in exactly one catalog
  | { kind: 'ambiguous'; refs: Array<{ ref: string; version: string }> }; // appears in multiple

type CatalogMap = Record<string, CatalogEntry>;
```

`unique` entries have a pre-resolved `ref` (e.g. `'catalog:'` or `'catalog:dev'`) that is written directly to `package.json`. `ambiguous` entries require user resolution per workspace package.

### Data flow

```
pnpm-workspace.yaml
  → parseWorkspace()        # workspace.ts → { patterns, catalogMap }
  → findPackageJsons()      # sync.ts → list of package.json paths
  → for each file:
      resolveFileAmbiguous()  # index.ts → interactive select per ambiguous dep
      syncPackageJson()       # sync.ts → write resolved refs to disk
```

### Ambiguous package resolution

When a package appears in multiple catalogs (e.g. `react` in both `catalog:react18` and `catalog:react19`), resolution is **per workspace package**:

- **TTY + not `--check`**: `@inquirer/select` prompt with file/field/version context embedded in the message; each workspace package resolves independently
- **Non-TTY or `--check`**: skipped, collected by name (deduplicated), printed as a warning

`syncPackageJson` receives a flat `Record<string, string>` (already resolved) — it has no knowledge of ambiguity.

## Build & Publishing

- Output: single minified ESM at `dist/index.js` with `#!/usr/bin/env node` shebang
- CI (`publish.yml`) triggers on `v*.*.*` tags: verifies tag matches `package.json` version, then runs check → typecheck → test → build → `npm publish --provenance`
- To release: bump version in `package.json`, commit, tag (`git tag vX.Y.Z`), push with `--tags`

## Testing

Tests use real temporary directories (`mkdtempSync`) — no mocking. Always run `pnpm check` before committing; Biome formatting must pass in CI.
