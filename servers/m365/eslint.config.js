import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.vitest,
        ...globals.jest,
        fs: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  {
    // Browser code: the interactive views and their local preview host.
    files: [
      'src/views/**/*.{ts,tsx}',
      'preview/**/*.{ts,js}',
      'test/view-*.test.{ts,tsx}',
      'test/helpers/*.tsx',
    ],
    languageOptions: { globals: { ...globals.browser } },
    // TypeScript resolves DOM and Node type names itself; no-undef only produces false errors.
    rules: { 'no-undef': 'off' },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'bin/**',
      'src/generated/**',
      '.venv/**',
    ],
  },
];
