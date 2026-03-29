/** catalog.config 导出的配置项类型 */
export type CatalogGroup = Record<string, string[]>;

/** 配置中的单个条目：字符串、字符串数组（默认 catalog）、或按名分组的对象 */
export type CatalogEntry = string | string[] | CatalogGroup;

/** catalog.config 默认导出的完整配置 */
export type CatalogConfig = CatalogEntry[] | CatalogGroup;

/** 规范化后的 catalog 结构 */
export interface NormalizedCatalog {
  /** 默认 catalog 的包列表（对应 pnpm-workspace.yaml 的 `catalog:` 块） */
  defaultCatalog: string[];
  /** 命名 catalog 的包列表（对应 `catalogs:` 块） */
  groupedCatalogs: Record<string, string[]>;
}

/** 包名 → catalog 名称的映射（null 表示默认 catalog） */
export type DepToCatalog = Record<string, string | null>;

/** 包名 → 版本号的映射 */
export type VersionMap = Record<string, string>;

/** 从 pnpm-workspace.yaml 解析出的数据 */
export interface WorkspaceFile {
  patterns: string[];
  versions: VersionMap;
}

/** CLI 运行时选项 */
export interface RunOptions {
  fetchLatest: boolean;
  dryRun: boolean;
}
