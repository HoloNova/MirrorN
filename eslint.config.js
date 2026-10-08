import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const unused = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }];
export default defineConfig([
  globalIgnores(['.local/**', '.pi/**', 'dist/**', 'node_modules/**', 'content/**', 'public/**', 'templates/**', '.react-router/**']),
  { files: ['**/*.js', '**/*.ts', '**/*.tsx'], extends: [js.configs.recommended], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts', '**/*.tsx'] })),
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': unused } },
  { files: ['**/*.js'], rules: { 'no-unused-vars': unused } },
  {
    files: ['src/content/parse/files.ts', 'src/content/schema/primitives.ts', 'src/content/search/query.ts',
      'src/content/validate/document-urls.ts', 'src/delivery/links.ts', 'src/delivery/manifest.ts'],
    rules: { 'no-control-regex': 'off' },
  },
]);
