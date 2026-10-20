import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const buildNumber = process.env.GITHUB_RUN_NUMBER;
let commit = process.env.GITHUB_SHA?.slice(0, 7);
if (!commit) {
  try { commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { commit = 'local'; }
}
// Each published Pages build gets an incrementing prerelease ID and its exact source revision.
const release = buildNumber && /^\d+$/.test(buildNumber)
  ? packageVersion.replace(/-alpha\.\d+$/, `-alpha.${buildNumber}`)
  : packageVersion;
const buildVersion = `${release}+${commit}`;

export default defineConfig({
  base: '/pfx-qr-studio/',
  define: { __PFX_BUILD_VERSION__: JSON.stringify(buildVersion) },
  resolve: { alias: { '@pfxamd/qr-core': fileURLToPath(new URL('./core/src/index.ts', import.meta.url)) } },
});
