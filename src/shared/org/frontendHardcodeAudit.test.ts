import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Phase 8 — forbid Org-1 URL/brand hardcodes in runtime frontend sources.
 * Seeds, docs, migrations, and tests may still mention Org #1 values.
 */

const ROOT = process.cwd();

const RUNTIME_GLOBS_ROOTS = ['src/app', 'src/features', 'src/shared'];

const ALLOWED_PATH_FRAGMENTS = [
  '.test.ts',
  '.test.tsx',
  '/org/orgBranding.test.ts',
  // Folder name kept for compatibility; page is OrganizationGuidePage.
  '/features/team-seyda/',
];

/** Critical Org-1 markers that must not appear as runtime FE hardcodes. */
const FORBIDDEN = [
  /https?:\/\/teamseydaguide\.netlify\.app/i,
  /https?:\/\/waytomoon\.netlify\.app/i,
  /https?:\/\/mywaytomoon\.netlify\.app/i,
  /ONBOARDING_URL\s*=\s*['"`]https?:\/\//i,
];

const FORBIDDEN_STRING_LITERALS = [
  /['"`]Team Seyda Guide['"`]/,
  /['"`]https?:\/\/teamseydaguide/i,
  /['"`]https?:\/\/waytomoon\.netlify/i,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function isAllowed(path: string): boolean {
  const rel = relative(ROOT, path).replaceAll('\\', '/');
  return ALLOWED_PATH_FRAGMENTS.some((f) => rel.includes(f));
}

describe('Phase 8 — frontend Org-1 hardcode audit', () => {
  const files = RUNTIME_GLOBS_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter(
    (f) => !isAllowed(f)
  );

  it('scans runtime FE sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('forbids hardcoded Team Seyda / WayToMoon URLs in runtime FE', () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const re of [...FORBIDDEN, ...FORBIDDEN_STRING_LITERALS]) {
        if (re.test(text)) {
          hits.push(`${relative(ROOT, file)} matches ${re}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('OrganizationGuidePage does not pin Org-1 guide URL', () => {
    const page = readFileSync(join(ROOT, 'src/features/team-seyda/TeamSeydaPage.tsx'), 'utf8');
    expect(page).toMatch(/OrganizationGuidePage/);
    expect(page).not.toMatch(/teamseydaguide/i);
    expect(page).not.toMatch(/waytomoon\.netlify/i);
  });

  it('shareToolsDisplay does not pin ONBOARDING_URL', () => {
    const share = readFileSync(join(ROOT, 'src/shared/lib/shareToolsDisplay.ts'), 'utf8');
    expect(share).not.toMatch(/ONBOARDING_URL\s*=/);
    expect(share).not.toMatch(/waytomoon\.netlify\.app/i);
    expect(share).not.toMatch(/teamseydaguide/i);
  });

  it('coach-chat event labels no longer say WayToMoon', () => {
    const coachChat = readFileSync(join(ROOT, 'supabase/functions/coach-chat/index.ts'), 'utf8');
    expect(coachChat).toMatch(/waytomoon_sent/);
    expect(coachChat).not.toMatch(/WayToMoon (gesendet|sent|envoyé|inviato|wysłany|gönderildi)/);
    expect(coachChat).toMatch(/Onboarding (gesendet|sent|envoyé|inviato|wysłany|gönderildi)/);
  });
});
