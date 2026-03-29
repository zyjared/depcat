import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getWorkspacePackageJsonPaths,
  updatePackageJson,
} from '../src/package-json.ts';

function writePkg(dir: string, content: object) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

function readPkg(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('updatePackageJson', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('updates to default catalog reference', () => {
    writePkg(tmp, {
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
    });
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null, 'react-dom': null },
      false,
    );
    expect(r.updatedRefs).toBe(2);
    expect(readPkg(tmp).dependencies.react).toBe('catalog:');
    expect(readPkg(tmp).dependencies['react-dom']).toBe('catalog:');
  });

  it('updates to named catalog reference', () => {
    writePkg(tmp, {
      devDependencies: { vite: '^5.0.0', typescript: '^5.0.0' },
    });
    updatePackageJson(
      join(tmp, 'package.json'),
      { vite: 'dev', typescript: 'dev' },
      false,
    );
    const pkg = readPkg(tmp);
    expect(pkg.devDependencies.vite).toBe('catalog:dev');
    expect(pkg.devDependencies.typescript).toBe('catalog:dev');
  });

  it('does not overwrite already-correct references', () => {
    writePkg(tmp, { dependencies: { react: 'catalog:' } });
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null },
      false,
    );
    expect(r.updatedRefs).toBe(0);
    expect(r.changed).toBe(false);
  });

  it('skips packages absent from the catalog map', () => {
    writePkg(tmp, { dependencies: { react: '^18.0.0', lodash: '^4.0.0' } });
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null },
      false,
    );
    expect(r.updatedRefs).toBe(1);
    expect(readPkg(tmp).dependencies.lodash).toBe('^4.0.0');
  });

  it('sorts dependency keys alphabetically', () => {
    writePkg(tmp, { dependencies: { zod: '^3.0.0', react: '^18.0.0' } });
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null },
      false,
    );
    expect(r.sortedFields).toBe(1);
    expect(Object.keys(readPkg(tmp).dependencies)).toEqual(['react', 'zod']);
  });

  it('does not write to disk in dry-run mode', () => {
    const original = JSON.stringify(
      { dependencies: { react: '^18.0.0' } },
      null,
      2,
    );
    writeFileSync(join(tmp, 'package.json'), original);
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null },
      true,
    );
    expect(r.changed).toBe(true);
    expect(readFileSync(join(tmp, 'package.json'), 'utf8')).toBe(original);
  });

  it('updates across all dep fields', () => {
    writePkg(tmp, {
      dependencies: { react: '^18.0.0' },
      devDependencies: { vite: '^5.0.0' },
      peerDependencies: { 'react-dom': '^18.0.0' },
    });
    const r = updatePackageJson(
      join(tmp, 'package.json'),
      { react: null, vite: 'dev', 'react-dom': null },
      false,
    );
    expect(r.updatedRefs).toBe(3);
  });
});

describe('getWorkspacePackageJsonPaths', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('returns paths matching workspace glob patterns', () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    mkdirSync(join(tmp, 'packages', 'pkg-b'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), { name: 'pkg-a' });
    writePkg(join(tmp, 'packages', 'pkg-b'), { name: 'pkg-b' });

    const paths = getWorkspacePackageJsonPaths(tmp, ['packages/*']);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.includes('pkg-a'))).toBe(true);
  });

  it('excludes directories not matching patterns', () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    mkdirSync(join(tmp, 'tools', 'cli'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), {});
    writePkg(join(tmp, 'tools', 'cli'), {});

    const paths = getWorkspacePackageJsonPaths(tmp, ['packages/*']);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('pkg-a');
  });

  it('excludes node_modules', () => {
    mkdirSync(join(tmp, 'packages', 'app'), { recursive: true });
    mkdirSync(join(tmp, 'node_modules', 'react'), { recursive: true });
    writePkg(join(tmp, 'packages', 'app'), {});
    writePkg(join(tmp, 'node_modules', 'react'), {});

    const paths = getWorkspacePackageJsonPaths(tmp, ['packages/*']);
    expect(paths.every((p) => !p.includes('node_modules'))).toBe(true);
    expect(paths).toHaveLength(1);
  });

  it('supports nested glob with **', () => {
    mkdirSync(join(tmp, 'packages', 'core', 'utils'), { recursive: true });
    writePkg(join(tmp, 'packages', 'core', 'utils'), { name: 'utils' });

    const paths = getWorkspacePackageJsonPaths(tmp, ['packages/**']);
    expect(paths.some((p) => p.includes('utils'))).toBe(true);
  });

  it('returns empty array when no packages match', () => {
    const paths = getWorkspacePackageJsonPaths(tmp, ['apps/*']);
    expect(paths).toHaveLength(0);
  });

  it('returns empty array when pattern list is empty', () => {
    mkdirSync(join(tmp, 'packages', 'pkg-a'), { recursive: true });
    writePkg(join(tmp, 'packages', 'pkg-a'), {});

    const paths = getWorkspacePackageJsonPaths(tmp, []);
    expect(existsSync(join(tmp, 'packages', 'pkg-a', 'package.json'))).toBe(
      true,
    );
    expect(paths).toHaveLength(0);
  });
});
