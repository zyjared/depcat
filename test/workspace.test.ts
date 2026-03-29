import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWorkspaceYaml, parseWorkspaceFile } from '../src/workspace.ts';

const SAMPLE_YAML = `\
packages:
  - "apps/*"
  - "packages/*"

catalog:
  react: "^18.3.1"
  react-dom: "^18.3.1"

catalogs:
  dev:
    typescript: "^5.0.0"
    vite: "^6.0.0"
`;

describe('parseWorkspaceFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('returns empty result when file does not exist', () => {
    expect(parseWorkspaceFile('/nonexistent/pnpm-workspace.yaml')).toEqual({
      patterns: [],
      versions: {},
    });
  });

  it('parses workspace glob patterns', () => {
    const file = join(tmp, 'pnpm-workspace.yaml');
    writeFileSync(file, SAMPLE_YAML);
    const { patterns } = parseWorkspaceFile(file);
    expect(patterns).toEqual(['apps/*', 'packages/*']);
  });

  it('parses default catalog versions', () => {
    const file = join(tmp, 'pnpm-workspace.yaml');
    writeFileSync(file, SAMPLE_YAML);
    const { versions } = parseWorkspaceFile(file);
    expect(versions.react).toBe('^18.3.1');
    expect(versions['react-dom']).toBe('^18.3.1');
  });

  it('parses named catalog versions', () => {
    const file = join(tmp, 'pnpm-workspace.yaml');
    writeFileSync(file, SAMPLE_YAML);
    const { versions } = parseWorkspaceFile(file);
    expect(versions.typescript).toBe('^5.0.0');
    expect(versions.vite).toBe('^6.0.0');
  });

  it('handles scoped package names with double quotes', () => {
    const file = join(tmp, 'pnpm-workspace.yaml');
    writeFileSync(file, 'catalog:\n  "@types/node": "^20.0.0"\ncatalogs:\n');
    const { versions } = parseWorkspaceFile(file);
    expect(versions['@types/node']).toBe('^20.0.0');
  });
});

describe('buildWorkspaceYaml', () => {
  it('uses default patterns when none provided', () => {
    const yaml = buildWorkspaceYaml([], [], {}, {});
    expect(yaml).toContain('"apps/*"');
    expect(yaml).toContain('"packages/*"');
  });

  it('uses provided patterns', () => {
    const yaml = buildWorkspaceYaml(['libs/*'], [], {}, {});
    expect(yaml).toContain('"libs/*"');
    expect(yaml).not.toContain('"apps/*"');
  });

  it('emits default catalog block', () => {
    const yaml = buildWorkspaceYaml(
      ['apps/*'],
      ['react', 'react-dom'],
      {},
      { react: '^18.3.1', 'react-dom': '^18.3.1' },
    );
    expect(yaml).toContain('catalog:');
    expect(yaml).toContain('  react: "^18.3.1"');
    expect(yaml).toContain('  react-dom: "^18.3.1"');
  });

  it('emits named catalogs block', () => {
    const yaml = buildWorkspaceYaml(
      ['apps/*'],
      [],
      { dev: ['typescript', 'vite'] },
      { typescript: '^5.0.0', vite: '^6.0.0' },
    );
    expect(yaml).toContain('catalogs:');
    expect(yaml).toContain('  dev:');
    expect(yaml).toContain('    typescript: "^5.0.0"');
  });

  it('quotes scoped package names', () => {
    const yaml = buildWorkspaceYaml(
      [],
      ['@types/node'],
      {},
      { '@types/node': '^20.0.0' },
    );
    expect(yaml).toContain('  "@types/node": "^20.0.0"');
  });

  it('falls back to "latest" for packages with no resolved version', () => {
    const yaml = buildWorkspaceYaml([], ['react'], {}, {});
    expect(yaml).toContain('  react: "latest"');
  });

  it('roundtrips with parseWorkspaceFile', () => {
    const versions = { react: '^18.3.1', typescript: '^5.0.0' };
    const yaml = buildWorkspaceYaml(
      ['apps/*'],
      ['react'],
      { dev: ['typescript'] },
      versions,
    );

    const tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
    try {
      const file = join(tmp, 'pnpm-workspace.yaml');
      writeFileSync(file, yaml);
      const parsed = parseWorkspaceFile(file);
      expect(parsed.patterns).toEqual(['apps/*']);
      expect(parsed.versions.react).toBe('^18.3.1');
      expect(parsed.versions.typescript).toBe('^5.0.0');
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
