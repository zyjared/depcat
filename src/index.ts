import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { version as VERSION } from '../package.json';
import { normalizeCatalogConfig } from './catalog';
import { fetchLatestVersions } from './npm';
import {
  getWorkspacePackageJsonPaths,
  updatePackageJson,
} from './package-json.ts';
import type {
  CatalogConfig,
  DepToCatalog,
  RunOptions,
  VersionMap,
} from './types.ts';
import {
  buildWorkspaceYaml,
  parseWorkspaceFile,
  writeWorkspaceYaml,
} from './workspace.ts';

function printHelp(): void {
  console.log(`depcat v${VERSION}

Sync pnpm workspace catalog from a config file.

Usage:
  depcat [options]

Options:
  -l, --fetch-latest  Fetch latest versions from npm registry
  -d, --dry-run       Preview changes without writing any files
  -v, --version       Print version
  -h, --help          Print this help message`);
}

function parseCliArgs(): RunOptions {
  const { values } = parseArgs({
    options: {
      'fetch-latest': { type: 'boolean', default: false, short: 'l' },
      'dry-run': { type: 'boolean', default: false, short: 'd' },
      version: { type: 'boolean', default: false, short: 'v' },
      help: { type: 'boolean', default: false, short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.version) {
    console.log(VERSION);
    process.exit(0);
  }
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    fetchLatest: values['fetch-latest'] ?? false,
    dryRun: values['dry-run'] ?? false,
  };
}

/** 从 cwd 开始向上查找 catalog.config.[m]js（最多 5 层） */
function findConfigPath(from: string): string {
  const candidates = ['catalog.config.mjs', 'catalog.config.js'];
  let dir = from;
  for (let i = 0; i < 5; i++) {
    for (const name of candidates) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`catalog.config.[m]js not found. Create one in: ${from}`);
}

/** 根据选项决定版本来源：复用已有版本或从 npm 拉取最新 */
async function resolveVersions(
  pkgs: string[],
  options: RunOptions,
  existing: VersionMap,
): Promise<VersionMap> {
  if (options.fetchLatest) return fetchLatestVersions(pkgs);

  let reused = 0;
  let fallback = 0;
  const versions = Object.fromEntries(
    pkgs.map((pkg) => {
      const v = existing[pkg];
      v ? reused++ : fallback++;
      return [pkg, v ?? 'latest'];
    }),
  );
  console.log(
    `Versions: ${reused} reused from pnpm-workspace.yaml, ${fallback} fallback to "latest"\n`,
  );
  return versions;
}

async function main(): Promise<void> {
  const options = parseCliArgs();
  const configPath = findConfigPath(process.cwd());
  const root = join(configPath, '..');

  // 用 file:// URL 加载，确保在 Windows 下绝对路径也能正确解析
  const { default: config } = (await import(
    pathToFileURL(configPath).href
  )) as {
    default: CatalogConfig;
  };

  const { defaultCatalog, groupedCatalogs } = normalizeCatalogConfig(config);

  // 构建 pkg → catalogName 映射，同时检测配置中的重复包
  const depToCatalog: DepToCatalog = {};
  const allPkgs: string[] = [];
  const entries: Array<[string, string | null]> = [
    ...defaultCatalog.map((p): [string, null] => [p, null]),
    ...Object.entries(groupedCatalogs).flatMap(([name, pkgs]) =>
      pkgs.map((p): [string, string] => [p, name]),
    ),
  ];
  for (const [pkg, catalog] of entries) {
    if (pkg in depToCatalog)
      throw new Error(`Duplicate package in catalog config: "${pkg}"`);
    depToCatalog[pkg] = catalog;
    allPkgs.push(pkg);
  }

  const workspacePath = join(root, 'pnpm-workspace.yaml');
  const workspaceFile = parseWorkspaceFile(workspacePath);
  const versions = await resolveVersions(
    allPkgs,
    options,
    workspaceFile.versions,
  );

  // 写入 pnpm-workspace.yaml
  const yaml = buildWorkspaceYaml(
    workspaceFile.patterns,
    defaultCatalog,
    groupedCatalogs,
    versions,
  );
  writeWorkspaceYaml(root, yaml, options.dryRun);

  // 更新根目录及各子包的 package.json
  const rootPkgJson = join(root, 'package.json');
  const pkgJsonPaths = [
    ...(existsSync(rootPkgJson) ? [rootPkgJson] : []),
    ...getWorkspacePackageJsonPaths(root, workspaceFile.patterns),
  ];
  let changedFiles = 0;
  let changedRefs = 0;
  let sortedFields = 0;

  for (const filePath of pkgJsonPaths) {
    const r = updatePackageJson(filePath, depToCatalog, options.dryRun);
    if (r.changed) {
      changedFiles++;
      changedRefs += r.updatedRefs;
      sortedFields += r.sortedFields;
      const rel = filePath.slice(root.length + 1).replaceAll('\\', '/');
      console.log(
        `✓ ${rel} (${r.updatedRefs} refs, ${r.sortedFields} sorted fields)`,
      );
    }
  }

  console.log(
    `\n✓ ${changedFiles} files, ${changedRefs} refs, ${sortedFields} sorted fields`,
  );
  if (options.dryRun) console.log('→ Dry-run only, no files written');
  else console.log('→ Run: pnpm install');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
