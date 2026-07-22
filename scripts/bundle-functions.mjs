#!/usr/bin/env node
/**
 * Erzeugt aus den modularen Edge Functions die Einzeldatei-Varianten für
 * das Supabase-Dashboard (setup/functions/*.ts).
 *
 * Warum: Das Dashboard kennt keine `_shared`-Imports. Bisher wurden die
 * Einzeldateien von Hand gepflegt — zwei Wahrheiten für denselben Code,
 * die garantiert auseinanderlaufen. Ab jetzt sind sie generiert.
 *
 *   node scripts/bundle-functions.mjs          # schreiben
 *   node scripts/bundle-functions.mjs --check  # nur prüfen (CI)
 *
 * Es werden ausschließlich die tatsächlich importierten Shared-Module
 * eingebettet — kein toter Code in Functions, die kein LLM brauchen.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const OUT_DIR = join(ROOT, 'setup', 'functions');

const FUNCTIONS = ['validate-invite', 'coach-chat', 'ingest-knowledge'];

const IMPORT_RE = /^import\s+(?:type\s+)?\{?[^}]*\}?\s*from\s+'([^']+)';?\s*$/;
const SHARED_RE = /^\.\.\/_shared\/(.+)$/;

/** Reihenfolge der eingebetteten Module: stabil, damit Diffs klein bleiben. */
const SHARED_ORDER = ['cors.ts', 'llm.ts', 'prompts.ts'];

function bundle(name) {
  const path = join(FUNCTIONS_DIR, name, 'index.ts');
  if (!existsSync(path)) throw new Error(`Function fehlt: ${path}`);
  const lines = readFileSync(path, 'utf8').split('\n');

  const shared = new Set();
  const remoteImports = [];
  const body = [];

  for (const line of lines) {
    const match = line.match(IMPORT_RE);
    if (!match) {
      body.push(line);
      continue;
    }
    const sharedMatch = match[1].match(SHARED_RE);
    if (sharedMatch) shared.add(sharedMatch[1]);
    else remoteImports.push(line); // jsr:/npm:/https: bleibt echter Import
  }

  const unknown = [...shared].filter((f) => !SHARED_ORDER.includes(f));
  if (unknown.length > 0) {
    throw new Error(`Unbekanntes Shared-Modul ${unknown.join(', ')} — SHARED_ORDER ergänzen.`);
  }

  const inlined = SHARED_ORDER.filter((f) => shared.has(f)).map((file) => {
    const raw = readFileSync(join(FUNCTIONS_DIR, '_shared', file), 'utf8');
    const nested = raw
      .split('\n')
      .some((l) => SHARED_RE.test(l.match(IMPORT_RE)?.[1] ?? ''));
    if (nested) throw new Error(`${file} importiert ein anderes Shared-Modul — Bundler erweitern.`);
    return `// ---- inline: _shared/${file} ----\n${raw.trim()}\n`;
  });

  const header =
    `// AscendOS Edge Function: ${name} (Dashboard-Version, alles in einer Datei)\n` +
    `// Name der Function MUSS exakt lauten: ${name}\n` +
    `//\n` +
    `// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.\n` +
    `// Quelle: supabase/functions/${name}/index.ts\n`;

  return [
    header,
    ...remoteImports,
    remoteImports.length > 0 ? '' : null,
    ...inlined,
    body.join('\n').replace(/^\n+/, '').trimEnd(),
    '',
  ]
    .filter((part) => part !== null)
    .join('\n');
}

const check = process.argv.includes('--check');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let drift = 0;
for (const name of FUNCTIONS) {
  const out = join(OUT_DIR, `${name}.ts`);
  const next = bundle(name);
  const current = existsSync(out) ? readFileSync(out, 'utf8') : null;

  if (check) {
    if (current !== next) {
      console.error(`✗ ${name}.ts weicht von der Quelle ab`);
      drift += 1;
    } else {
      console.log(`✓ ${name}.ts aktuell`);
    }
  } else {
    writeFileSync(out, next);
    console.log(`${current === next ? '=' : '→'} setup/functions/${name}.ts`);
  }
}

if (check && drift > 0) {
  console.error('\n`npm run bundle:functions` ausführen und committen.');
  process.exit(1);
}
