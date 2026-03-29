# depcat

Sync your pnpm workspace [catalog](https://pnpm.io/catalogs) from a single config file.

- Writes `pnpm-workspace.yaml` (`catalog:` / `catalogs:` blocks) from your config
- Updates `catalog:` references in all workspace `package.json` files (including root)
- Sorts dependencies alphabetically
- Reuses existing version pins by default; optionally fetches latest from npm

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
  -l, --fetch-latest  Fetch latest versions from npm registry
  -d, --dry-run       Preview changes without writing any files
  -v, --version       Print version
  -h, --help          Print this help message
```

## Configuration

Create a `catalog.config.mjs` in your project root:

```js
// catalog.config.mjs
export default [
  // Strings and arrays → default catalog
  'react',
  'react-dom',
  ['zustand', 'zod'],

  // Object → named catalogs
  {
    ui: ['tailwindcss', 'clsx', 'tailwind-merge'],
    dev: ['typescript', 'vite', '@biomejs/biome'],
  },
]
```

Then run:

```bash
depcat
```

This generates (or updates) `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: "^19.1.0"
  react-dom: "^19.1.0"
  zod: "^3.24.2"
  zustand: "^5.0.3"

catalogs:
  dev:
    "@biomejs/biome": "^1.9.4"
    typescript: "^5.8.3"
    vite: "^6.3.5"
  ui:
    clsx: "^2.1.1"
    tailwind-merge: "^3.3.0"
    tailwindcss: "^4.1.6"
```

And updates each workspace `package.json` to use catalog references:

```json
{
  "dependencies": {
    "react": "catalog:",
    "zustand": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:dev",
    "vite": "catalog:dev"
  }
}
```

## Config format

The default export can be an **array** or an **object**.

| Entry type            | Result                        |
| --------------------- | ----------------------------- |
| `"pkg"`               | Added to default catalog      |
| `["pkg-a", "pkg-b"]`  | Added to default catalog      |
| `{ name: ["pkg-a"] }` | Added to named catalog `name` |

Object shorthand (equivalent to wrapping in an array):

```js
export default {
  ui: ['tailwindcss'],
  dev: ['typescript'],
}
```

## Version resolution

By default, depcat reuses version pins already present in `pnpm-workspace.yaml`. New packages fall back to `"latest"`.

Use `--fetch-latest` (`-l`) to pull the current latest version from npm for all packages:

```bash
depcat --fetch-latest
```

## Requirements

Node.js ≥ 18, pnpm workspace with `pnpm-workspace.yaml`.
