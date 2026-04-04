/** catalog 条目：唯一来源 或 多 catalog 来源（需用户选择） */
export type CatalogEntry =
  | { kind: 'unique'; ref: string }
  | { kind: 'ambiguous'; refs: Array<{ ref: string; version: string }> };

/** 包名 → catalog 条目映射 */
export type CatalogMap = Record<string, CatalogEntry>;

/** pnpm-workspace.yaml 解析结果 */
export interface Workspace {
  patterns: string[];
  catalogMap: CatalogMap;
}

/** CLI 运行选项 */
export interface RunOptions {
  check: boolean;
}
