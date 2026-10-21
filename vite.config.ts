import { pfxReleasePlugin } from "./scripts/pfx-release.mjs";
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [pfxReleasePlugin()],
  base: '/pfx-qr-studio/',
  resolve: { alias: { '@pfxamd/qr-core': fileURLToPath(new URL('./core/src/index.ts', import.meta.url)) } },
});
