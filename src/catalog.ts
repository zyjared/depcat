import type {
  CatalogConfig,
  CatalogEntry,
  CatalogGroup,
  NormalizedCatalog,
} from './types.ts';

const sort = (arr: string[]) => [...arr].sort((a, b) => a.localeCompare(b));

/**
 * 将用户配置规范化为内部结构，并对包名和 catalog 名进行排序。
 * 支持三种写法：
 *   - 字符串 / 字符串数组 → 默认 catalog
 *   - 对象 `{ catalogName: string[] }` → 命名 catalog
 *   - 数组：以上写法的混合
 */
export function normalizeCatalogConfig(
  config: CatalogConfig,
): NormalizedCatalog {
  const defaultCatalog: string[] = [];
  const groups: Record<string, string[]> = {};

  function add(pkg: string, catalog?: string): void {
    if (typeof pkg !== 'string')
      throw new TypeError(`Expected string, got ${typeof pkg}`);
    if (catalog) {
      const existing = groups[catalog];
      if (existing) {
        existing.push(pkg);
      } else {
        groups[catalog] = [pkg];
      }
    } else {
      defaultCatalog.push(pkg);
    }
  }

  function processEntry(entry: CatalogEntry): void {
    if (typeof entry === 'string') {
      add(entry);
      return;
    }
    if (Array.isArray(entry)) {
      for (const pkg of entry) add(pkg);
      return;
    }
    for (const [name, pkgs] of Object.entries(entry as CatalogGroup)) {
      if (!Array.isArray(pkgs))
        throw new TypeError(`Catalog "${name}" must be a string[]`);
      for (const pkg of pkgs) add(pkg, name);
    }
  }

  Array.isArray(config) ? config.forEach(processEntry) : processEntry(config);

  return {
    defaultCatalog: sort(defaultCatalog),
    groupedCatalogs: Object.fromEntries(
      sort(Object.keys(groups)).map((name) => [name, sort(groups[name] ?? [])]),
    ),
  };
}
