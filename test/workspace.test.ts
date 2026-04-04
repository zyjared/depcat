import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseWorkspace } from '../src/workspace.ts';

function writeYaml(dir: string, content: string): string {
  const file = join(dir, 'pnpm-workspace.yaml');
  writeFileSync(file, content);
  return file;
}

const FULL_YAML = `\
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
  ui:
    tailwindcss: "^4.0.0"
`;

describe('parseWorkspace', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'depcat-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true }));

  it('returns empty result when file does not exist', () => {
    expect(parseWorkspace('/nonexistent/pnpm-workspace.yaml')).toEqual({
      patterns: [],
      catalogMap: {},
    });
  });

  it('parses workspace glob patterns', () => {
    const file = writeYaml(tmp, FULL_YAML);
    expect(parseWorkspace(file).patterns).toEqual(['apps/*', 'packages/*']);
  });

  it('maps default catalog packages as unique with "catalog:" ref', () => {
    const file = writeYaml(tmp, FULL_YAML);
    const { catalogMap } = parseWorkspace(file);
    expect(catalogMap.react).toEqual({ kind: 'unique', ref: 'catalog:' });
    expect(catalogMap['react-dom']).toEqual({
      kind: 'unique',
      ref: 'catalog:',
    });
  });

  it('maps named catalog packages as unique with "catalog:<name>" ref', () => {
    const file = writeYaml(tmp, FULL_YAML);
    const { catalogMap } = parseWorkspace(file);
    expect(catalogMap.typescript).toEqual({
      kind: 'unique',
      ref: 'catalog:dev',
    });
    expect(catalogMap.vite).toEqual({ kind: 'unique', ref: 'catalog:dev' });
    expect(catalogMap.tailwindcss).toEqual({
      kind: 'unique',
      ref: 'catalog:ui',
    });
  });

  it('marks packages in multiple named catalogs as ambiguous', () => {
    const file = writeYaml(
      tmp,
      'catalogs:\n  react18:\n    react: "^18.3.1"\n  react19:\n    react: "^19.0.0"\n',
    );
    const { catalogMap } = parseWorkspace(file);
    expect(catalogMap.react?.kind).toBe('ambiguous');
    if (catalogMap.react?.kind === 'ambiguous') {
      expect(catalogMap.react.refs).toEqual([
        { ref: 'catalog:react18', version: '^18.3.1' },
        { ref: 'catalog:react19', version: '^19.0.0' },
      ]);
    }
  });

  it('marks packages in both default and named catalog as ambiguous', () => {
    const file = writeYaml(
      tmp,
      'catalog:\n  react: "^18.3.1"\ncatalogs:\n  react19:\n    react: "^19.0.0"\n',
    );
    const { catalogMap } = parseWorkspace(file);
    expect(catalogMap.react?.kind).toBe('ambiguous');
    if (catalogMap.react?.kind === 'ambiguous') {
      expect(catalogMap.react.refs).toEqual([
        { ref: 'catalog:', version: '^18.3.1' },
        { ref: 'catalog:react19', version: '^19.0.0' },
      ]);
    }
  });

  it('handles scoped package names', () => {
    const file = writeYaml(
      tmp,
      'catalog:\n  "@types/node": "^20.0.0"\ncatalogs:\n  dev:\n    "@biomejs/biome": "^2.0.0"\n',
    );
    const { catalogMap } = parseWorkspace(file);
    expect(catalogMap['@types/node']).toEqual({
      kind: 'unique',
      ref: 'catalog:',
    });
    expect(catalogMap['@biomejs/biome']).toEqual({
      kind: 'unique',
      ref: 'catalog:dev',
    });
  });

  it('returns empty catalogMap when no catalog sections exist', () => {
    const file = writeYaml(tmp, 'packages:\n  - "packages/*"\n');
    const { catalogMap, patterns } = parseWorkspace(file);
    expect(catalogMap).toEqual({});
    expect(patterns).toEqual(['packages/*']);
  });

  it('returns empty patterns when packages section is absent', () => {
    const file = writeYaml(tmp, 'catalog:\n  react: "^18.0.0"\n');
    expect(parseWorkspace(file).patterns).toEqual([]);
  });

  it('throws on invalid YAML', () => {
    const file = writeYaml(tmp, 'catalog:\n  react: [unclosed\n');
    expect(() => parseWorkspace(file)).toThrow(
      'Failed to parse pnpm-workspace.yaml',
    );
  });
});
