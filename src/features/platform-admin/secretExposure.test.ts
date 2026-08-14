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
        // Allow documentation comments that say "never show X" only if not assigning values.
        expect(text.includes(`${key}=`), `${file} must not assign ${key}`).toBe(false);
        expect(text.includes(`"${key}"`), `${file} must not stringify ${key} as config`).toBe(
          false
        );
      }
    }
  });

  it('platform settings UI only exposes configured/connected metadata', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/features/platform-admin/PlatformSettingsPage.tsx'),
      'utf8'
    );
    expect(page).toMatch(/configured|connected|not_implemented/);
    for (const key of FORBIDDEN) {
      expect(page.includes(key)).toBe(false);
    }
  });
});
