import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // A loaded machine (two gates at once, a Chrome run) must not fail a test that only imports code.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
