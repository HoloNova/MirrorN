import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import { contentIntegration } from './src/content/integration.ts';

export default defineConfig({
  plugins: [contentIntegration(), reactRouter()],
  server: {
    port: 4321,
    watch: { ignored: ['**/archive/**', '**/.local/**', '**/.pi/**', '**/dist/**'] },
  },
  preview: { port: 4321 },
  build: { assetsDir: 'assets', sourcemap: false },
});
