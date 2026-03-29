import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { DepToCatalog } from './types';

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const;

type PackageJson = Record<string, unknown> & {
  [F in (typeof DEP_FIELDS)[number]]?: Record<string, string>;
};

/** 对依赖对象按 key 排序，返回 [排序后的对象, 是否发生了变化] */
function sortObject(
  obj: Record<string, string>,
): [Record<string, string>, boolean] {
  const sorted = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  const changed = sorted.some(([k], i) => k !== Object.keys(obj)[i]);
  return [Object.fromEntries(sorted), changed];
}

/** 将 glob 模式转换为正则（支持 * 和 **） */
function globToRegExp(glob: string): RegExp {
  const s = glob
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\x00')
    .replaceAll('*', '[^/]*')
    .replaceAll('\x00', '.*');
  return new RegExp(`^${s}$`);
}

/** 递归遍历目录，yield 每个子包的 package.json 路径，跳过非源码目录 */
function* walkPackageJsons(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.turbo')
      continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    const pkgPath = join(full, 'package.json');
    if (existsSync(pkgPath)) yield pkgPath;
    yield* walkPackageJsons(full);
  }
}

/** 返回匹配工作空间 glob 模式的子包 package.json 路径列表 */
export function getWorkspacePackageJsonPaths(
  root: string,
  patterns: string[],
): string[] {
  const regexps = patterns.map(globToRegExp);
  return [...walkPackageJsons(root)].filter((filePath) => {
    const rel = filePath
      .slice(root.length + 1)
      .replaceAll('\\', '/')
      .replace(/\/package\.json$/, '');
    return regexps.some((re) => re.test(rel));
  });
}

/** 更新 package.json 中的 catalog 引用并对依赖键排序，dryRun 时不写入文件 */
export function updatePackageJson(
  filePath: string,
  depToCatalog: DepToCatalog,
  dryRun: boolean,
): { changed: boolean; updatedRefs: number; sortedFields: number } {
  const pkg = JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;
  let updatedRefs = 0;
  let sortedFields = 0;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;

    for (const name of Object.keys(deps)) {
      const catalog = depToCatalog[name];
      if (catalog === undefined) continue;
      // null → 默认 catalog，字符串 → 命名 catalog
      const expected = catalog ? `catalog:${catalog}` : 'catalog:';
      if (deps[name] !== expected) {
        deps[name] = expected;
        updatedRefs++;
      }
    }

    const [sorted, changed] = sortObject(deps);
    if (changed) {
      pkg[field] = sorted;
      sortedFields++;
    }
  }

  if ((updatedRefs > 0 || sortedFields > 0) && !dryRun) {
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return {
    changed: updatedRefs > 0 || sortedFields > 0,
    updatedRefs,
    sortedFields,
  };
}
