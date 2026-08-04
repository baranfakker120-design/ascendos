/**
 * Build-time gate: Vite inlines VITE_* into the client bundle.
 * Loads .env.production / .env.local / .env (Vite order-ish) so Cloudflare
 * Pages Git builds succeed when dashboard env vars are missing but
 * .env.production is committed (public anon client config).
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

// Match Vite production resolution closely enough for the assert gate.
loadDotEnvFile('.env.production');
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

Provide them via:
  - .env.production in the repo (public anon client config), or
  - Cloudflare Pages → Settings → Environment variables, or
  - local .env for development
`);
  process.exit(1);
}

console.log(
  'assert-vite-supabase-env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY present for build.'
);
