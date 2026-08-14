import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'CEREBRAS_API_KEY',
  'GROQ_API_KEY',
  'VAPID_PRIVATE_KEY',
  'META_APP_SECRET',
  'META_TOKEN_ENCRYPTION_KEY',
  'WEBHOOK_VERIFY_TOKEN',
  'CRON_SECRET',
] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|css|json)$/.test(name)) out.push(p);
  }
  return out;
}

describe('Phase 10 — secret exposure (platform-admin + FE src)', () => {
  it('platform-admin sources never embed secret env names as values', () => {
    const root = join(process.cwd(), 'src/features/platform-admin');
    const files = walk(root).filter((f) => !f.endsWith('.test.ts'));
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const key of FORBIDDEN) {
        expect(text.includes(`${key}=`), `${file} must not assign ${key}`).toBe(false);
        expect(text.includes(`"${key}"`), `${file} must not stringify ${key} as config`).toBe(
          false
        );
        expect(text.includes(key), `${file} must not mention ${key}`).toBe(false);
      }
    }
  });

  it('platform config RPC returns metadata only (migration)', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260906000050_phase10_platform_admin.sql'),
      'utf8'
    );
    expect(migration).toMatch(/platform_config_status/);
    expect(migration).toMatch(/'configured'/);
    expect(migration).toMatch(/'connected'/);
    expect(migration).toMatch(/'not_implemented'/);
    for (const key of FORBIDDEN) {
      expect(migration.includes(key)).toBe(false);
    }
  });
});
