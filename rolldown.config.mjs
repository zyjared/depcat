import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
    minify: true,
  },
  external: [/^node:/],
  platform: 'node',
  transform: {
    define: {
      // __VERSION__:
    },
  },
});
