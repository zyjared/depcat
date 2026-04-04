import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import select from '@inquirer/select';
import pc from 'picocolors';
import { version as VERSION } from '../package.json';
import {
  printAllInSync,
  printCatalogCount,
  printCheckFailed,
  printFile,
  printHint,
  printSkipped,
  printSyncDone,
} from './output.ts';
import { DEP_FIELDS, findPackageJsons, syncPackageJson } from './sync.ts';
import type { CatalogMap } from './types.ts';
import { parseWorkspace } from './workspace.ts';

function printHelp(): void {
  console.log(`depcat v${VERSION}

Sync catalog references across pnpm workspace packages.

Usage:
  depcat [options]

Options:
  -c, --check     Check whether all references are in sync, exit 1 if not
      --version   Print version number
  -h, --help      Print this help message`);
}

/** 从 cwd 开始向上查找 pnpm-workspace.yaml（最多 5 层） */
function findWorkspacePath(from: string): string {
  let dir = from;
  for (let i = 0; i < 5; i++) {
    const p = join(dir, 'pnpm-workspace.yaml');
    if (existsSync(p)) return p;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'pnpm-workspace.yaml not found. Run depcat from within a pnpm workspace directory.',
  );
}

const FIELD_SHORT: Record<string, string> = {
  dependencies: 'dep',
  devDependencies: 'dev',
  peerDependencies: 'peer',
  optionalDependencies: 'opt',
};

type SkippedEntry = {
  name: string;
  refs: Array<{ ref: string; version: string }>;
};

/** 从 CatalogMap 提取 unique 包的映射（所有文件共用） */
function buildUniqueMap(catalogMap: CatalogMap): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [pkg, entry] of Object.entries(catalogMap)) {
    if (entry.kind === 'unique') map[pkg] = entry.ref;
  }
  return map;
}

/**
 * 处理单个文件中的 ambiguous 包：
 * - 有 TTY 且非 check 模式：逐个交互选择，返回该文件的 per-dep 解析结果
 * - 否则：收集到 skipped（调用方负责去重）
 */
async function resolveFileAmbiguous(
  filePath: string,
  rel: string,
  catalogMap: CatalogMap,
  isInteractive: boolean,
): Promise<{ perFile: Record<string, string>; skipped: SkippedEntry[] }> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return { perFile: {}, skipped: [] };
  }

  const perFile: Record<string, string> = {};
  const skipped: SkippedEntry[] = [];

  for (const field of DEP_FIELDS) {
    const deps = raw[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, current] of Object.entries(
      deps as Record<string, string>,
    )) {
      const entry = catalogMap[name];
      if (entry?.kind !== 'ambiguous') continue;

      if (isInteractive) {
        const short = FIELD_SHORT[field] ?? field;
        const maxLen = Math.max(...entry.refs.map((r) => r.ref.length));
        const ref = await select({
          message: `${pc.dim(rel)}  ${pc.dim(short)}  ${pc.bold(name)}  ${pc.dim(current)}`,
          choices: entry.refs.map((r) => ({
            name: `${r.ref.padEnd(maxLen)}  ${pc.dim(r.version)}`,
            value: r.ref,
          })),
        });
        perFile[name] = ref;
      } else {
        skipped.push({ name, refs: entry.refs });
      }
    }
  }

  return { perFile, skipped };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: 'boolean', default: false, short: 'c' },
      version: { type: 'boolean', default: false },
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

  const check = values.check ?? false;
  const workspacePath = findWorkspacePath(process.cwd());
  const root = join(workspacePath, '..');
  const { patterns, catalogMap } = parseWorkspace(workspacePath);

  const entryCount = Object.keys(catalogMap).length;
  if (entryCount === 0) {
    console.log('No catalog entries found in pnpm-workspace.yaml');
    if (check) process.exit(1);
    return;
  }
  printCatalogCount(entryCount);

  const rootPkg = join(root, 'package.json');
  const pkgPaths = [
    ...(existsSync(rootPkg) ? [rootPkg] : []),
    ...(await findPackageJsons(root, patterns)),
  ];

  const uniqueMap = buildUniqueMap(catalogMap);
  const isInteractive = process.stdout.isTTY === true && !check;

  // skipped 按包名去重：非交互模式下同一包在多个文件中只记录一次
  const skippedMap = new Map<string, SkippedEntry>();

  let changedFiles = 0;
  let totalRefs = 0;

  for (const filePath of pkgPaths) {
    const rel = relative(root, filePath).replaceAll('\\', '/');

    const { perFile, skipped } = await resolveFileAmbiguous(
      filePath,
      rel,
      catalogMap,
      isInteractive,
    );
    for (const entry of skipped) {
      if (!skippedMap.has(entry.name)) skippedMap.set(entry.name, entry);
    }

    const fileResolvedMap = { ...uniqueMap, ...perFile };
    const { changed, updatedRefs } = syncPackageJson(
      filePath,
      fileResolvedMap,
      check,
    );
    if (changed) {
      changedFiles++;
      totalRefs += updatedRefs;
      printFile(rel, updatedRefs, !check);
    }
  }

  const skipped = [...skippedMap.values()];
  printSkipped(skipped);

  if (changedFiles === 0 && skipped.length === 0) {
    printAllInSync();
    return;
  }

  if (check) {
    if (changedFiles > 0) {
      printCheckFailed(changedFiles, totalRefs);
      printHint('run depcat to fix');
    }
    if (skipped.length > 0) {
      printHint(
        'resolve ambiguous packages manually or run depcat interactively',
      );
    }
    process.exit(1);
  } else {
    if (changedFiles > 0) {
      printSyncDone(changedFiles, totalRefs);
      printHint('pnpm install');
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
