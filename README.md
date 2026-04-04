# depcat

Sync [`catalog:`](https://pnpm.io/catalogs) references across all `package.json` files in a pnpm workspace.

Reads `pnpm-workspace.yaml` as the single source of truth. For every dependency declared in a `catalog:` or `catalogs:` block, depcat finds matching entries in all workspace `package.json` files and rewrites them to use the correct catalog reference.

## Install

```bash
pnpm add -D depcat
```

Or run without installing:

```bash
pnpm dlx depcat
```

## Usage

```
depcat [options]

Options:
  -c, --check     Check whether all references are in sync, exit 1 if not
      --version   Print version
  -h, --help      Print this help message
```

Run from anywhere inside the workspace — depcat searches up to 5 parent directories for `pnpm-workspace.yaml`.

## Example

Given this `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: "^18.3.1"
  react-dom: "^18.3.1"

catalogs:
  dev:
    typescript: "^5.8.3"
    vite: "^6.3.5"
```

Running `depcat` rewrites all workspace `package.json` files:

```json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:dev",
    "vite": "catalog:dev"
  }
}
```

## Multi-catalog packages

If the same package appears in multiple catalogs (e.g. `react` in both `catalog:react18` and `catalog:react19`), depcat handles it per workspace package:

- **Interactive TTY** — prompts you to choose a catalog for each occurrence
- **Non-TTY / `--check`** — skips ambiguous packages and prints a warning

Each workspace package independently resolves which catalog to use, so `packages/app` can use `catalog:react18` while `packages/web` uses `catalog:react19`.

## CI

Use `--check` to verify all references are in sync without writing any files:

```bash
depcat --check
```

Exits `1` if any references are out of sync or ambiguous packages were skipped.

## Requirements

Node.js ≥ 18, pnpm workspace with `pnpm-workspace.yaml`.
