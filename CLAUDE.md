# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**depcat** is a zero-dependency CLI tool that reads `pnpm-workspace.yaml` as the single source of truth and syncs `catalog:` / `catalog:<name>` references into all workspace `package.json` files.

## Commands

```bash
pnpm build         # Bundle src/index.ts → dist/index.js (rolldown, minified ESM with shebang)
pnpm check         # Biome lint + format check
pnpm check:fix     # Biome auto-fix
pnpm typecheck     # TypeScript type-check only (no emit)
pnpm test          # Run all tests once (vitest)
pnpm test:watch    # Vitest in watch mode
pnpm depcat        # Run the built CLI: node dist/index.js
```

Run a single test file:
```bash
pnpm vitest run test/workspace.test.ts
```

## Architecture

All source modules are pure functions with no runtime dependencies — only Node.js built-ins.

| Module | Responsibility |
|--------|---------------|
| `src/index.ts` | CLI entry: arg parsing, find `pnpm-workspace.yaml` (up to 5 parent dirs), orchestration |
| `src/types.ts` | Shared type definitions only |
| `src/workspace.ts` | `parseWorkspace()` → `{ patterns, catalogMap }` |
| `src/sync.ts` | `findPackageJsons()` + `syncPackageJson()` |

### Key type: `CatalogMap`

```ts
type CatalogMap = Record<string, string>
// e.g. { react: 'catalog:', typescript: 'catalog:dev' }
```

Values are the actual strings written to `package.json`. `catalog:` for the default block, `catalog:<name>` for named catalogs. No null sentinel.

### Data flow

```
pnpm-workspace.yaml
  → parseWorkspace()     # workspace.ts → { patterns, catalogMap }
  → findPackageJsons()   # sync.ts → list of package.json paths
  → syncPackageJson()    # sync.ts → update each file
```

## CLI Usage

```
depcat [options]

Options:
  -n, --dry-run   Preview changes without writing any files
      --version   Print version
  -h, --help      Print this help message
```

Searches up to 5 parent directories for `pnpm-workspace.yaml`.

## Build & Publishing

- Output is a single minified ESM file with `#!/usr/bin/env node` shebang at `dist/index.js`
- CI (`publish.yml`) triggers on `v*.*.*` tags: check → typecheck → test → build → `npm publish` with provenance
- `pnpm release` bumps the version; tag must match `package.json` version before publish

## Testing

Tests use vitest and operate on real temporary directories (`mkdtempSync`) — no mocking. Test files: `test/workspace.test.ts`, `test/sync.test.ts`.
