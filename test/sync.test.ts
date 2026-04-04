import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPackageJsons, syncPackageJson } from '../src/sync.ts';

function writePkg(dir: string, content: object) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

function readPkg(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('syncPackageJson', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('replaces a version string with the default catalog reference', () => {
    writePkg(tmp, { dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' } });
    const r = syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:', 'react-dom': 'catalog:' }, false);
    expect(r.updatedRefs).toBe(2);
    expect(readPkg(tmp).dependencies.react).toBe('catalog:');
    expect(readPkg(tmp).dependencies['react-dom']).toBe('catalog:');
  });

  it('replaces a version string with a named catalog reference', () => {
    writePkg(tmp, { devDependencies: { vite: '^5.0.0', typescript: '^5.0.0' } });
    syncPackageJson(join(tmp, 'package.json'), { vite: 'catalog:dev', typescript: 'catalog:dev' }, false);
    const pkg = readPkg(tmp);
    expect(pkg.devDependencies.vite).toBe('catalog:dev');
    expect(pkg.devDependencies.typescript).toBe('catalog:dev');
  });

  it('updates an existing catalog ref to a different catalog', () => {
    writePkg(tmp, { dependencies: { react: 'catalog:react18' } });
    const r = syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:react19' }, false);
    expect(r.updatedRefs).toBe(1);
    expect(readPkg(tmp).dependencies.react).toBe('catalog:react19');
  });

  it('does not count already-correct references as updates', () => {
    writePkg(tmp, { dependencies: { react: 'catalog:' } });
    const r = syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:' }, false);
    expect(r.updatedRefs).toBe(0);
    expect(r.changed).toBe(false);
  });

  it('skips packages absent from resolvedMap', () => {
    writePkg(tmp, { dependencies: { react: '^18.0.0', lodash: '^4.0.0' } });
    const r = syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:' }, false);
    expect(r.updatedRefs).toBe(1);
    expect(readPkg(tmp).dependencies.lodash).toBe('^4.0.0');
  });

  it('returns changed: false with empty resolvedMap', () => {
    writePkg(tmp, { dependencies: { react: '^18.0.0' } });
    const r = syncPackageJson(join(tmp, 'package.json'), {}, false);
    expect(r.changed).toBe(false);
    expect(r.updatedRefs).toBe(0);
  });

  it('updates across all dependency fields', () => {
    writePkg(tmp, {
      dependencies: { react: '^18.0.0' },
      devDependencies: { vite: '^5.0.0' },
      peerDependencies: { 'react-dom': '^18.0.0' },
      optionalDependencies: { sharp: '^0.33.0' },
    });
    const r = syncPackageJson(
      join(tmp, 'package.json'),
      { react: 'catalog:', vite: 'catalog:dev', 'react-dom': 'catalog:', sharp: 'catalog:' },
      false,
    );
    expect(r.updatedRefs).toBe(4);
  });

  it('does not write to disk in dry-run mode', () => {
    const original = JSON.stringify({ dependencies: { react: '^18.0.0' } }, null, 2);
    writeFileSync(join(tmp, 'package.json'), original);
    const r = syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:' }, true);
    expect(r.changed).toBe(true);
    expect(readFileSync(join(tmp, 'package.json'), 'utf8')).toBe(original);
  });

  it('throws on invalid JSON', () => {
    writeFileSync(join(tmp, 'package.json'), '{ invalid json }');
    expect(() =>
      syncPackageJson(join(tmp, 'package.json'), { react: 'catalog:' }, false),
    ).toThrow('Failed to parse');
  });
});

describe('findPackageJsons', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('returns paths matching workspace glob patterns', async () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    mkdirSync(join(tmp, 'packages', 'pkg-b'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), { name: 'pkg-a' });
    writePkg(join(tmp, 'packages', 'pkg-b'), { name: 'pkg-b' });
    const paths = await findPackageJsons(tmp, ['packages/*']);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.includes('pkg-a'))).toBe(true);
    expect(paths.some((p) => p.includes('pkg-b'))).toBe(true);
  });

  it('excludes directories not matching patterns', async () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    mkdirSync(join(tmp, 'tools', 'cli'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), {});
    writePkg(join(tmp, 'tools', 'cli'), {});
    const paths = await findPackageJsons(tmp, ['packages/*']);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('pkg-a');
  });

  it('supports nested glob with **', async () => {
    mkdirSync(join(tmp, 'packages', 'core', 'utils'), { recursive: true });
    writePkg(join(tmp, 'packages', 'core', 'utils'), { name: 'utils' });
    const paths = await findPackageJsons(tmp, ['packages/**']);
    expect(paths.some((p) => p.includes('utils'))).toBe(true);
  });

  it('returns empty array when no packages match', async () => {
    expect(await findPackageJsons(tmp, ['apps/*'])).toHaveLength(0);
  });

  it('returns empty array for empty pattern list', async () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), {});
    expect(await findPackageJsons(tmp, [])).toHaveLength(0);
  });
});
