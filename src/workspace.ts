import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { CatalogMap, Workspace } from './types.ts';

type WorkspaceYaml = {
  packages?: string[];
  catalog?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;
};

export function parseWorkspace(workspacePath: string): Workspace {
  if (!existsSync(workspacePath)) return { patterns: [], catalogMap: {} };

  let doc: WorkspaceYaml;
  try {
    doc = parse(readFileSync(workspacePath, 'utf8')) as WorkspaceYaml;
  } catch (err) {
    throw new Error(
      `Failed to parse pnpm-workspace.yaml: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const patterns = doc.packages ?? [];

  // 收集每个包在各 catalog 中的所有 { version, ref }
  const collected: Record<string, Array<{ version: string; ref: string }>> = {};

  for (const [pkg, version] of Object.entries(doc.catalog ?? {})) {
    if (!collected[pkg]) collected[pkg] = [];
    collected[pkg].push({ version, ref: 'catalog:' });
  }

  for (const [name, pkgs] of Object.entries(doc.catalogs ?? {})) {
    for (const [pkg, version] of Object.entries(pkgs)) {
      if (!collected[pkg]) collected[pkg] = [];
      collected[pkg].push({ version, ref: `catalog:${name}` });
    }
  }

  // 单一来源 → unique；多来源 → ambiguous（保留版本信息用于展示）
  const catalogMap: CatalogMap = {};
  for (const [pkg, entries] of Object.entries(collected)) {
    if (entries.length === 1 && entries[0]) {
      catalogMap[pkg] = { kind: 'unique', ref: entries[0].ref };
    } else {
      catalogMap[pkg] = {
        kind: 'ambiguous',
        refs: entries.map(({ version, ref }) => ({ version, ref })),
      };
    }
  }

  return { patterns, catalogMap };
}
