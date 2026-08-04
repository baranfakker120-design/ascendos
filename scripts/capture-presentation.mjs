#!/usr/bin/env node
/**
 * Captures AscendOS screens at iPhone 16 Pro logical size for marketing boards.
 * Requires: npm run presentation:dev (or starts Vite itself).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW = resolve(ROOT, 'presentation/raw');
const PORT = 5179;
const BASE = `http://127.0.0.1:${PORT}`;

const VIEWPORT = { width: 402, height: 874 }; // iPhone 16 Pro logical
const DEVICE_SCALE = 3;

const SCREENS = [
  { id: 'today', path: '/', wait: 1200 },
  { id: 'coach', path: '/coach', wait: 1600 },
  { id: 'team', path: '/team', wait: 1600 },
  { id: 'contacts', path: '/kontakte', wait: 1200 },
  { id: 'stories', path: '/', wait: 1000, note: 'stories-on-today' },
  { id: 'dashboard', path: '/team', wait: 1200 },
  { id: 'analytics', path: '/qualifikationen', wait: 1200 },
  { id: 'notifications', path: '/settings', wait: 1000 },
  { id: 'settings', path: '/settings', wait: 1000 },
  { id: 'profile', path: '/profil', wait: 1200 },
  { id: 'more', path: '/more', wait: 1200 },
];

const COACH_WORKSPACE = {
  version: 1,
  activeId: 'a6000000-0000-4000-8000-0000000000e1',
  mobilePane: 'chat',
  updatedAt: Date.now(),
  conversations: [
    {
      id: 'a6000000-0000-4000-8000-0000000000e1',
      serverConversationId: 'a6000000-0000-4000-8000-0000000000e1',
      title: 'Ascent · CEO Briefing',
      kind: 'ceo',
      topic: 'Heute priorisieren',
      contactId: null,
      partnerName: null,
      membershipId: null,
      seedPrompt: null,
      contextBrief: null,
      contextAttached: true,
      preview: 'Dein Fokus heute: Julia zum Fit Check führen.',
      createdAt: new Date(Date.now() - 3 * 864e5).toISOString(),
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      archivedAt: null,
    },
    {
      id: 'a6000000-0000-4000-8000-0000000000e2',
      serverConversationId: null,
      title: 'Lena · Next Step',
      kind: 'person',
      topic: 'Follow-up',
      contactId: null,
      partnerName: 'Lena Weiss',
      membershipId: 'a3000000-0000-4000-8000-0000000000b2',
      seedPrompt: null,
      contextBrief: null,
      contextAttached: false,
      preview: 'Wie öffne ich das Gespräch ohne Druck?',
      createdAt: new Date(Date.now() - 864e5).toISOString(),
      updatedAt: new Date(Date.now() - 2e4).toISOString(),
      lastOpenedAt: new Date(Date.now() - 2e4).toISOString(),
      archivedAt: null,
    },
  ],
};

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready: ${url}`);
}

function startVite() {
  const child = spawn(
    'npx',
    ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITE_PRESENTATION_CAPTURE: '1',
        VITE_SUPABASE_URL:
          process.env.VITE_SUPABASE_URL ?? 'https://shaydtihwicnocjjlnjm.supabase.co',
        VITE_SUPABASE_ANON_KEY:
          process.env.VITE_SUPABASE_ANON_KEY ??
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoYXlkdGlod2ljbm9jampsbmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTkxMTMsImV4cCI6MjA5NjQ5NTExM30.GI7e2piwdrC5lNCkRqJsKMKKTXFjQqU_y5NbBNc76yM',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }
  );
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  return child;
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const vite = startVite();
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      isMobile: true,
      hasTouch: true,
      locale: 'de-DE',
    });

    await context.addInitScript((workspace) => {
      localStorage.setItem(
        'ascendos.first-launch.v1',
        JSON.stringify({
          completed: true,
          completedAt: new Date().toISOString(),
          step: 'finish',
        })
      );
      localStorage.setItem('ascendos.coach-workspace.v1', JSON.stringify(workspace));
      localStorage.setItem('ascendos.locale', 'de');
      document.documentElement.style.setProperty('--safe-top', '54px');
      document.documentElement.style.setProperty('--safe-bottom', '28px');
    }, COACH_WORKSPACE);

    const page = await context.newPage();

    // Also capture real production login (no presentation mode)
    try {
      const live = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE,
        isMobile: true,
        hasTouch: true,
      });
      const livePage = await live.newPage();
      await livePage.goto('https://deploy-preview-44--ascendseyda.netlify.app/login', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await livePage.waitForTimeout(1200);
      await livePage.screenshot({ path: resolve(RAW, 'login-real.png'), type: 'png' });
      await live.close();
    } catch (err) {
      console.warn('Real login capture skipped:', err.message);
    }

    const manifest = [];
    for (const screen of SCREENS) {
      await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(screen.wait);
      // Hide sync / language chrome noise if needed — keep real UI
      const file = `${screen.id}.png`;
      await page.screenshot({ path: resolve(RAW, file), type: 'png' });
      manifest.push({ ...screen, file });
      console.log('captured', file);
    }

    writeFileSync(resolve(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser.close();
    console.log('Raw screenshots →', RAW);
  } finally {
    try {
      if (vite.pid) process.kill(-vite.pid, 'SIGKILL');
    } catch {
      try {
        vite.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
