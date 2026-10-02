import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@owox/ui': fromRoot('./ui/vendor/owox-ui'),
      '@owox/plugin-sdk': fromRoot('./ui/sdk-mock.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    css: false,
    setupFiles: ['./ui/test/setup.ts'],
    include: ['ui/**/*.test.{ts,tsx}'],
  },
});
