import { readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'tinyglobby';

export const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

type PackageJson = Record<string, unknown> & {
  [F in (typeof DEP_FIELDS)[number]]?: Record<string, string>;
};

/** 返回匹配工作空间 glob 模式的子包 package.json 路径列表 */
export function findPackageJsons(
  root: string,
  patterns: string[],
): Promise<string[]> {
  if (patterns.length === 0) return Promise.resolve([]);
  return glob(
    patterns.map((p) => `${p}/package.json`),
    { cwd: root, absolute: true },
  );
}

/** 将 package.json 中匹配 resolvedMap 的依赖版本替换为 catalog 引用，dryRun 时不写入磁盘 */
export function syncPackageJson(
  filePath: string,
  resolvedMap: Record<string, string>,
  dryRun: boolean,
): { updatedRefs: number; changed: boolean } {
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;
  } catch {
    throw new Error(`Failed to parse ${filePath}: invalid JSON`);
  }

  let updatedRefs = 0;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps) continue;
    for (const [name, current] of Object.entries(deps)) {
      const ref = resolvedMap[name];
      if (ref === undefined || current === ref) continue;
      deps[name] = ref;
      updatedRefs++;
    }
  }

  if (updatedRefs > 0 && !dryRun) {
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return { updatedRefs, changed: updatedRefs > 0 };
}
