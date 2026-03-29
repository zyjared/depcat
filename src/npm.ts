import type { VersionMap } from './types';

const REGISTRY = 'https://registry.npmjs.org';
const TIMEOUT_MS = 10_000;

/** fetch 包装，加超时保护，避免请求长时间挂起 */
async function fetchWithTimeout(url: string): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 查询单个包的最新版本。
 * 使用 /-/package/{pkg}/dist-tags 端点——比 /{pkg}/latest 响应更小，
 * 只返回 { latest, next, ... } 而不是完整的版本元数据。
 * 注意：scoped 包（如 @types/node）中的 / 需编码为 %2F。
 */
async function fetchLatestVersion(pkg: string): Promise<string> {
  const encoded = pkg.replaceAll('/', '%2F');
  const res = await fetchWithTimeout(
    `${REGISTRY}/-/package/${encoded}/dist-tags`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tags = (await res.json()) as Record<string, string>;
  const version = tags.latest;
  if (!version) throw new Error('no latest dist-tag found');
  return version;
}

type FetchResult =
  | { pkg: string; version: string }
  | { pkg: string; error: Error };

/**
 * 并发查询所有包的最新版本（无批量 API，单请求并发是最优方案）。
 * 将错误内化为 fulfilled 值，统一携带 pkg 名，避免 rejected 时丢失上下文。
 * 失败的包回退到 "latest"，不中断整体流程。
 * 返回 pkg → "^x.y.z" 的映射。
 */
export async function fetchLatestVersions(pkgs: string[]): Promise<VersionMap> {
  console.log(`Fetching ${pkgs.length} packages from npm registry...\n`);

  // 将错误内化为 fulfilled 值，统一携带 pkg 名，避免 rejected 时丢失上下文
  const results = await Promise.all(
    pkgs.map(async (pkg): Promise<FetchResult> => {
      try {
        const version = await fetchLatestVersion(pkg);
        return { pkg, version: `^${version}` };
      } catch (err) {
        return {
          pkg,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }),
  );

  const versions: VersionMap = {};
  for (const r of results) {
    if ('version' in r) {
      versions[r.pkg] = r.version;
      console.log(`  ✓  ${r.pkg.padEnd(40)} ${r.version.slice(1)}`);
    } else {
      versions[r.pkg] = 'latest';
      console.error(`  ✗  ${r.pkg}: ${r.error.message}`);
    }
  }

  return versions;
}
