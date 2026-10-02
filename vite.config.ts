import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  root: 'ui',
  base: command === 'build' ? '/smart-data-reports/' : '/',
  resolve: {
    alias: {
      '@owox/ui': fromRoot('./ui/vendor/owox-ui'),
      // The real SDK only works inside the ODM iframe. `vite dev` uses the mock unless
      // VITE_REAL_SDK=1, which the tunnel loop on a real host sets.
      ...(command === 'serve' && process.env.VITE_REAL_SDK !== '1'
        ? { '@owox/plugin-sdk': fromRoot('./ui/sdk-mock.ts') }
        : {}),
    },
  },
  server: {
    // The plugin iframe has an opaque origin, so even our own bundle is a cross-origin fetch.
    cors: true,
    allowedHosts: process.env.TUNNEL_HOST ? [process.env.TUNNEL_HOST] : [],
  },
  build: { outDir: '../dist', emptyOutDir: true },
}));
