/**
 * Build-time gate: Vite inlines VITE_* into the client bundle.
 * Missing vars at build produce a ConfigMissing screen in production.
 * Fail the build early (esp. Cloudflare Pages) instead of shipping an empty config.
 *
 * Loads .env / .env.local the same way local Vite builds do, so `npm run build`
 * with a local .env keeps working. Cloudflare Pages injects process.env directly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvFile('.env.local');
loadDotEnvFile('.env');

const url = (process.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (process.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

if (!url || !anonKey) {
  console.error(`
AscendOS build aborted: missing Vite Supabase environment variables.

Required at BUILD time (not runtime):
  VITE_SUPABASE_URL
  VITE_SUPABASE_ANON_KEY

Set them in Cloudflare Pages → Settings → Environment variables
for Production (and Preview, if used), then redeploy.

Locally: copy .env.example to .env and fill in values from \`supabase start\`.
`);
  process.exit(1);
}

console.log('assert-vite-supabase-env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY present for build.');
