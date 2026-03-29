import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VersionMap, WorkspaceFile } from './types';

const DEFAULT_PATTERNS = ['apps/*', 'packages/*'];

/** 将含 @ 或 / 的包名用双引号包裹，确保 YAML 合法 */
const yamlKey = (key: string) =>
  key.includes('@') || key.includes('/') ? `"${key}"` : key;

/**
 * 单次解析 pnpm-workspace.yaml，同时提取：
 *   - packages: 块中的工作空间 glob 模式
 *   - catalog:/catalogs: 块中的已有版本号（用于复用，避免无谓的 npm 请求）
 */
export function parseWorkspaceFile(workspacePath: string): WorkspaceFile {
  if (!existsSync(workspacePath)) return { patterns: [], versions: {} };

  const patterns: string[] = [];
  const versions: VersionMap = {};
  let section: 'packages' | 'catalog' | 'catalogs' | null = null;
  let currentCatalog: string | null = null;

  for (const raw of readFileSync(workspacePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // 非缩进行：识别节名，其他顶层 key 重置状态
    if (!raw.startsWith(' ') && !raw.startsWith('\t')) {
      currentCatalog = null;
      if (line === 'packages:') {
        section = 'packages';
        continue;
      }
      if (line === 'catalog:') {
        section = 'catalog';
        continue;
      }
      if (line === 'catalogs:') {
        section = 'catalogs';
        continue;
      }
      section = null;
      continue;
    }

    switch (section) {
      case 'packages': {
        const m = raw.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
        if (m?.[1]) patterns.push(m[1]);
        break;
      }
      case 'catalog': {
        // 格式：  "pkg": "version"
        const m = raw.match(/^ {2}("?[^":]+"?):\s*"([^"]+)"\s*$/);
        if (m?.[1] && m[2]) versions[m[1].replace(/^"|"$/g, '')] = m[2];
        break;
      }
      case 'catalogs': {
        // 两格缩进：catalog 组名；四格缩进：包条目
        const group = raw.match(/^ {2}(\w[\w-]*):\s*$/);
        if (group?.[1]) {
          currentCatalog = group[1];
          break;
        }
        if (!currentCatalog) break;
        const m = raw.match(/^ {4}("?[^":]+"?):\s*"([^"]+)"\s*$/);
        if (m?.[1] && m[2]) versions[m[1].replace(/^"|"$/g, '')] = m[2];
        break;
      }
    }
  }

  return { patterns, versions };
}

/** 将规范化的 catalog 数据序列化为 pnpm-workspace.yaml 文本 */
export function buildWorkspaceYaml(
  workspacePatterns: string[],
  defaultCatalog: string[],
  groupedCatalogs: Record<string, string[]>,
  versions: VersionMap,
): string {
  const patterns =
    workspacePatterns.length > 0 ? workspacePatterns : DEFAULT_PATTERNS;
  const lines: string[] = [
    'packages:',
    ...patterns.map((p) => `  - "${p}"`),
    '',
  ];

  if (defaultCatalog.length > 0) {
    lines.push('catalog:');
    for (const pkg of defaultCatalog) {
      lines.push(`  ${yamlKey(pkg)}: "${versions[pkg] ?? 'latest'}"`);
    }
    lines.push('');
  }

  lines.push('catalogs:');
  for (const [name, pkgs] of Object.entries(groupedCatalogs)) {
    lines.push(`  ${name}:`);
    for (const pkg of pkgs) {
      lines.push(`    ${yamlKey(pkg)}: "${versions[pkg] ?? 'latest'}"`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function writeWorkspaceYaml(
  root: string,
  content: string,
  dryRun: boolean,
): void {
  if (dryRun) {
    console.log('\n--- pnpm-workspace.yaml (dry-run) ---');
    console.log(content);
    console.log('---');
  } else {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), content);
    console.log('\n✓ pnpm-workspace.yaml updated');
  }
}
