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

const SHARED_RE = /^\.\.\/_shared\/(.+)$/;

/**
 * Zerlegt eine Datei in Import-Specifier und Rest-Body.
 *
 * Arbeitet über die gesamte Datei statt Zeile für Zeile, weil
 * MEHRZEILIGE Imports sonst unentdeckt durchrutschen: ein zeilenweiser
 * Matcher hätte den Specifier nicht erkannt, das Shared-Modul nicht
 * eingebettet und die `import`-Zeile als Body übernommen — ein Bundle,
 * das im Dashboard sofort scheitert, aber lokal fehlerfrei aussieht.
 */
function splitImports(source) {
  const IMPORT_STATEMENT =
    /^import\s+(?:[\s\S]*?\s+from\s+)?'([^']+)';?[ \t]*$/gm;
  const specifiers = [];
  const body = source.replace(IMPORT_STATEMENT, (match, spec) => {
    specifiers.push({ spec, statement: match });
    return '\u0000'; // Platzhalter, wird unten entfernt
  });
  return {
    specifiers,
    body: body
      .split('\n')
      .filter((l) => l !== '\u0000')
      .join('\n'),
  };
}

/** Reihenfolge der eingebetteten Module: stabil, damit Diffs klein bleiben. */
const SHARED_ORDER = ['cors.ts', 'gemini.ts', 'prompts.ts'];

const DECL_RE =
  /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

/** Sammelt Top-Level-Namen (Spalte 0, also nicht eingerückt) und meldet
 *  Doppelte über alle eingebetteten Teile hinweg. */
function assertNoCollisions(name, inlinedParts, functionBody) {
  const seen = new Map();
  const dupes = [];
  const parts = [...inlinedParts, functionBody];
  for (const part of parts) {
    const local = new Set();
    for (const m of part.matchAll(DECL_RE)) {
      const ident = m[1];
      if (local.has(ident)) continue; // Overloads o. Ä. innerhalb einer Datei
      local.add(ident);
      if (seen.has(ident)) dupes.push(ident);
      else seen.set(ident, true);
    }
  }
  if (dupes.length > 0) {
    throw new Error(
      `${name}: doppelte Top-Level-Deklaration(en) im Bundle: ${[...new Set(dupes)].join(', ')}\n` +
        '  Shared-Module teilen im Bundle einen Scope — Namen eindeutig machen.'
    );
  }
}

function bundle(name) {
  const path = join(FUNCTIONS_DIR, name, 'index.ts');
  if (!existsSync(path)) throw new Error(`Function fehlt: ${path}`);
  const { specifiers, body: bodyText } = splitImports(readFileSync(path, 'utf8'));

  const shared = new Set();
  const remoteImports = [];

  for (const { spec, statement } of specifiers) {
    const sharedMatch = spec.match(SHARED_RE);
    if (sharedMatch) shared.add(sharedMatch[1]);
    else remoteImports.push(statement); // jsr:/npm:/https: bleibt echter Import
  }

  // Sicherheitsnetz: kein `_shared`-Import darf den Filter überleben.
  if (bodyText.includes('_shared/')) {
    throw new Error(
      `${name}: nicht erkannter _shared-Import im Body — splitImports() prüfen.`
    );
  }
  const body = [bodyText];

  const unknown = [...shared].filter((f) => !SHARED_ORDER.includes(f));
  if (unknown.length > 0) {
    throw new Error(`Unbekanntes Shared-Modul ${unknown.join(', ')} — SHARED_ORDER ergänzen.`);
  }

  const inlined = SHARED_ORDER.filter((f) => shared.has(f)).map((file) => {
    const raw = readFileSync(join(FUNCTIONS_DIR, '_shared', file), 'utf8');
    const parsed = splitImports(raw);
    if (parsed.specifiers.some((i) => SHARED_RE.test(i.spec))) {
      throw new Error(`${file} importiert ein anderes Shared-Modul — Bundler erweitern.`);
    }
    // Remote-Imports der Shared-Module nach oben ziehen. Sie wären als
    // Top-Level-Deklaration auch mitten in der Datei gültig (ES-Module
    // hoisten), aber ein Bundle mit Imports in Zeile 43 liest sich wie ein
    // Fehler und provoziert genau die Handbearbeitung, die verboten ist.
    for (const { statement } of parsed.specifiers) remoteImports.push(statement);
    return `// ---- inline: _shared/${file} ----\n${parsed.body.trim()}\n`;
  });

  // Im Bundle landen alle Shared-Module im SELBEN Scope. Gleichnamige
  // Top-Level-Deklarationen sind dort ein Syntaxfehler — der im modularen
  // Code niemals auffällt. Deshalb hier hart prüfen.
  assertNoCollisions(name, inlined, body.join('\n'));

  const header =
    `// AscendOS Edge Function: ${name} (Dashboard-Version, alles in einer Datei)\n` +
    `// Name der Function MUSS exakt lauten: ${name}\n` +
    `//\n` +
    `// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.\n` +
    `// Quelle: supabase/functions/${name}/index.ts\n`;

  return [
    header,
    ...[...new Set(remoteImports)],
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
