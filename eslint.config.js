import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

const unused = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }];

export default defineConfig([
  globalIgnores(['archive/**', '.local/**', '.pi/**', 'dist/**', 'node_modules/**', 'content/**', 'public/**', 'templates/**', '.astro/**']),
  {
    files: ['**/*.js', '**/*.ts'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts'] })),
  { files: ['**/*.ts'], rules: { '@typescript-eslint/no-unused-vars': unused } },
  { files: ['**/*.js'], rules: { 'no-unused-vars': unused } },
  {
    // 这些边界有意检测 NUL／控制字符，规则不能把“拒绝该字符”当成误写。
    files: ['src/content/parse/files.ts', 'src/content/schema/primitives.ts', 'src/content/search/query.ts',
      'src/content/validate/document-urls.ts', 'src/delivery/links.ts', 'src/delivery/manifest.ts'],
    rules: { 'no-control-regex': 'off' },
  },
  ...astro.configs.recommended,
  {
    files: ['**/*.astro'],
    languageOptions: { parserOptions: { parser: tseslint.parser }, globals: { ...globals.browser } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unused,
      'astro/no-set-html-directive': 'error',
    },
  },
]);
