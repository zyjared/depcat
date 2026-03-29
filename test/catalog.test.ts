import { describe, expect, it } from 'vitest';
import { normalizeCatalogConfig } from '../src/catalog.ts';

describe('normalizeCatalogConfig', () => {
  describe('default catalog', () => {
    it('handles flat string array', () => {
      const { defaultCatalog } = normalizeCatalogConfig(['react', 'react-dom']);
      expect(defaultCatalog).toEqual(['react', 'react-dom']);
    });

    it('handles nested string arrays', () => {
      const { defaultCatalog } = normalizeCatalogConfig([['zustand', 'zod']]);
      expect(defaultCatalog).toEqual(['zod', 'zustand']); // sorted
    });

    it('merges strings and arrays into default catalog', () => {
      const { defaultCatalog } = normalizeCatalogConfig([
        'react',
        ['zustand', 'zod'],
      ]);
      expect(defaultCatalog).toEqual(['react', 'zod', 'zustand']);
    });
  });

  describe('named catalogs', () => {
    it('handles object entries', () => {
      const { groupedCatalogs } = normalizeCatalogConfig([
        { dev: ['vite', 'typescript'] },
      ]);
      expect(groupedCatalogs.dev).toEqual(['typescript', 'vite']); // sorted
    });

    it('handles object shorthand (non-array export)', () => {
      const { defaultCatalog, groupedCatalogs } = normalizeCatalogConfig({
        dev: ['vite'],
        ui: ['tailwindcss'],
      });
      expect(defaultCatalog).toEqual([]);
      expect(groupedCatalogs.dev).toEqual(['vite']);
      expect(groupedCatalogs.ui).toEqual(['tailwindcss']);
    });

    it('sorts catalog names alphabetically', () => {
      const { groupedCatalogs } = normalizeCatalogConfig({
        z: ['pkg-z'],
        a: ['pkg-a'],
      });
      expect(Object.keys(groupedCatalogs)).toEqual(['a', 'z']);
    });
  });

  describe('mixed config', () => {
    it('separates default and named catalogs', () => {
      const { defaultCatalog, groupedCatalogs } = normalizeCatalogConfig([
        'react',
        ['zustand', 'zod'],
        { dev: ['vite', 'typescript'], ui: ['tailwindcss'] },
      ]);
      expect(defaultCatalog).toEqual(['react', 'zod', 'zustand']);
      expect(Object.keys(groupedCatalogs)).toEqual(['dev', 'ui']);
      expect(groupedCatalogs.dev).toEqual(['typescript', 'vite']);
    });
  });

  describe('error handling', () => {
    it('throws on non-string package entry', () => {
      // @ts-expect-error intentional invalid input
      expect(() => normalizeCatalogConfig([[42]])).toThrow('Expected string');
    });

    it('throws when catalog value is not an array', () => {
      // @ts-expect-error intentional invalid input
      expect(() => normalizeCatalogConfig({ dev: 'vite' })).toThrow(
        'must be a string[]',
      );
    });
  });
});
