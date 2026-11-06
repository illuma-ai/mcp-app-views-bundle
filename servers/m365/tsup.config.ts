import { defineConfig } from 'tsup';

export default defineConfig({
  // The view code under src/views/{client,ui,lib,mail,calendar,teams,files,contacts,tasks} runs in the browser: it is bundled into
  // src/generated/views-bundle.ts by bin/generate-views.mjs, not shipped as separate modules.
  entry: [
    'src/**/*.ts',
    '!src/views/client/**',
    '!src/views/ui/**',
    '!src/views/lib/**',
    '!src/views/mail/**',
    '!src/views/calendar/**',
    '!src/views/teams/**',
    '!src/views/files/**',
    '!src/views/contacts/**',
    '!src/views/tasks/**',
    'src/endpoints.json',
  ],
  format: ['esm'],
  target: 'es2020',
  outDir: 'dist',
  clean: true,
  bundle: false,
  splitting: false,
  sourcemap: false,
  dts: false,
  publicDir: false,
  onSuccess: process.platform === 'win32' ? undefined : 'chmod +x dist/index.js',
  loader: {
    '.json': 'copy',
  },
  noExternal: [],
  external: [
    '@azure/msal-node',
    '@modelcontextprotocol/sdk',
    'commander',
    'dotenv',
    'express',
    'js-yaml',
    'keytar',
    'winston',
    'zod',
  ],
});
