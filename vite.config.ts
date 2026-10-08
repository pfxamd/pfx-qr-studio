import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: '/pfx-qr-studio/',
  resolve: { alias: { '@pfxamd/qr-core': fileURLToPath(new URL('./core/src/index.ts', import.meta.url)) } },
});
