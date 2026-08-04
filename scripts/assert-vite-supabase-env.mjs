/**
 * Build-time gate: Vite inlines VITE_* into the client bundle.
 * Fail fast if they are missing so Cloudflare/CI never ships ConfigMissing.
 *
 * Loads .env / .env.local for local builds. Does NOT use a committed
 * .env.production (PR #36 workaround — rejected). Production relies on
 * Cloudflare Pages dashboard env injection (restored by PR #37).
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
(Production and Preview), or locally in .env (see .env.example).

Do NOT re-add pages_build_output_dir to wrangler.toml — that breaks
dashboard build-time injection (SEV-1 / PR #30).
`);
  process.exit(1);
}

console.log(
  'assert-vite-supabase-env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY present for build.'
);
