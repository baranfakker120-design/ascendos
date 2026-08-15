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

const FUNCTIONS = [
  'validate-invite',
  'coach-chat',
  'ingest-knowledge',
  'content-assistant',
  'content-daily-prepare',
  'content-autopilot',
  'content-autopilot-run',
  'instagram-oauth',
  'instagram-publish',
  'meta-data-deletion',
  'instagram-webhook',
  'coaching-push-dispatch',
  'knowledge-pdf-vision',
];

const SHARED_RE = /^\.\.\/_shared\/(.+)$/;
/** Import einer Schwesterdatei INNERHALB derselben Shared-Unterverzeichnis-
 *  gruppe, z. B. `./groq.ts` in `_shared/ai-providers/index.ts`. Anders als
 *  SHARED_RE (verlässt eine Function Richtung `_shared/`) bleibt dieser
 *  Import INNERHALB der Gruppe — genau der Fall, den flache Shared-Module
 *  wie `gemini.ts` nicht kennen, weil sie keine Nachbardateien haben. */
const SIBLING_RE = /^\.\/(.+)$/;
/** Import einer ANDEREN Shared-Gruppe, z. B. `../content-research/index.ts`
 *  aus `_shared/content-generate/index.ts`. Wird nicht als Remote belassen,
 *  sondern als transitive Gruppen-Abhängigkeit aufgelöst (siehe bundle). */
const CROSS_GROUP_RE = /^\.\.\/([A-Za-z0-9_-]+)\/(.+)$/;

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
  // Erfasst sowohl `import ... from '...'` als auch `export ... from
  // '...'` (Re-Export). Letzteres braucht ai-providers/index.ts, um
  // Typen und die Fehlerklasse aus types.ts durchzureichen. Ohne diese
  // Erweiterung würden Re-Export-Zeilen unerkannt im Body verbleiben und
  // beim Bundling auf eine im Dashboard nicht existierende relative
  // Datei verweisen — ein Bundle, das erst beim Deployment scheitert.
  //
  // Sicher additiv: eine Zeile wie `export const X = '...';` enthält
  // kein `from`, matcht also nicht; geprüft gegen alle drei bestehenden
  // Functions am 30. Juli 2026, keine betroffen.
  const IMPORT_STATEMENT = /^(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?'([^']+)';?[ \t]*$/gm;
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
const SHARED_ORDER = ['cors.ts', 'tenant.ts', 'gemini.ts', 'prompts.ts'];

/** Verzeichnisse unter `_shared/`, deren Dateien sich UNTEREINANDER über
 *  `./relativ.ts` importieren (siehe resolveSharedGroup). Ein neuer
 *  Provider-Ordner nach demselben Muster braucht hier nur einen Eintrag,
 *  keinen weiteren Eingriff im Bundler. */
const SHARED_GROUPS = [
  'ai-providers',
  'intent-router',
  'format',
  'content-research',
  'content-generate',
  'content-daily',
  'content-autopilot',
  'instagram-oauth',
  'instagram-publish',
  'meta',
  'coaching-push',
];

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

/**
 * Löst ein Shared-Modul auf, das selbst aus mehreren Dateien besteht und
 * diese über `./relativ.ts` untereinander importiert (z. B.
 * `_shared/ai-providers/`, bestehend aus index.ts, router.ts, types.ts
 * und je einem Adapter). Wird generisch für JEDES künftige Verzeichnis
 * unter `_shared/` verwendet — kein Sonderfall für ai-providers.
 *
 * Vorgehen: von der Einstiegsdatei (der Datei, die eine Function direkt
 * importiert) ausgehend werden alle über SIBLING_RE erreichbaren Dateien
 * eingesammelt, je einmal. Reihenfolge ist Auffindungsreihenfolge (Tiefe
 * zuerst) — das genügt, weil `assertNoCollisions` ohnehin über ALLE
 * eingebetteten Teile hinweg prüft und keine der Dateien zur Modulinit-
 * Zeit auf eine andere zugreift, nur innerhalb später aufgerufener
 * Funktionen. Ein Zyklus zwischen den Dateien ist unzulässig und wird
 * über die `seen`-Menge automatisch verhindert (zweiter Besuch wird
 * übersprungen, nicht erneut eingebettet).
 */
function resolveSharedGroup(groupDir, entryFile, remoteImports, seen = new Map()) {
  if (seen.has(entryFile)) return [];
  const raw = readFileSync(join(groupDir, entryFile), 'utf8');
  const parsed = splitImports(raw);
  const ownParts = [];

  for (const { spec, statement } of parsed.specifiers) {
    const siblingMatch = spec.match(SIBLING_RE);
    if (siblingMatch) {
      // z. B. './groq.ts' -> 'groq.ts', relativ zur GRUPPE, nicht zu
      // _shared/ selbst. Rekursiv einsammeln, BEVOR die eigene Datei
      // angehängt wird, damit Abhängigkeiten vor ihren Nutzern stehen
      // (kosmetisch für Lesbarkeit, funktional durch DAG-Annahme egal).
      ownParts.push(...resolveSharedGroup(groupDir, siblingMatch[1], remoteImports, seen));
      continue; // wird inline verfügbar, keine import-Zeile behalten
    }
    if (SHARED_RE.test(spec)) {
      throw new Error(
        `${entryFile}: Import zurück nach _shared/ aus einer Gruppe heraus wird nicht unterstützt.`
      );
    }
    // Cross-group (`../content-research/index.ts`): Import-Zeile verwerfen —
    // die Zielgruppe wird in bundle() separat (und genau einmal) inlinet.
    if (CROSS_GROUP_RE.test(spec)) {
      continue;
    }
    // jsr:/npm:/https: — echter externer Import, nach oben ziehen.
    remoteImports.push(statement);
  }

  seen.set(entryFile, true);
  ownParts.push(
    `// ---- inline: _shared/${groupDir.split('/').pop()}/${entryFile} ----\n${parsed.body.trim()}\n`
  );
  return ownParts;
}

/** Sammelt transitive Cross-Group-Abhängigkeiten (../other-group/entry). */
function collectCrossGroupDeps(groupName, entryFile, out, seenFiles = new Set()) {
  const key = `${groupName}/${entryFile}`;
  if (seenFiles.has(key)) return;
  seenFiles.add(key);
  const groupDir = join(FUNCTIONS_DIR, '_shared', groupName);
  const raw = readFileSync(join(groupDir, entryFile), 'utf8');
  const parsed = splitImports(raw);
  for (const { spec } of parsed.specifiers) {
    const siblingMatch = spec.match(SIBLING_RE);
    if (siblingMatch) {
      collectCrossGroupDeps(groupName, siblingMatch[1], out, seenFiles);
      continue;
    }
    const cross = spec.match(CROSS_GROUP_RE);
    if (cross) {
      const depGroup = cross[1];
      const depEntry = cross[2];
      if (!SHARED_GROUPS.includes(depGroup)) {
        throw new Error(
          `Unbekannte Cross-Group ${depGroup} (aus ${groupName}/${entryFile}) — SHARED_GROUPS ergänzen.`
        );
      }
      if (!out.has(depGroup)) out.set(depGroup, depEntry);
      collectCrossGroupDeps(depGroup, depEntry, out, seenFiles);
    }
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
    throw new Error(`${name}: nicht erkannter _shared-Import im Body — splitImports() prüfen.`);
  }
  const body = [bodyText];

  // Ein Eintrag in `shared` ist entweder eine flache Datei (`gemini.ts`,
  // Zusage über SHARED_ORDER) oder der Einstieg in eine Verzeichnisgruppe
  // (`ai-providers/index.ts`, Zusage über SHARED_GROUPS anhand des
  // führenden Verzeichnisnamens). Erkennung über den Schrägstrich.
  const flat = [...shared].filter((f) => !f.includes('/'));
  const grouped = [...shared].filter((f) => f.includes('/'));

  const unknownFlat = flat.filter((f) => !SHARED_ORDER.includes(f));
  if (unknownFlat.length > 0) {
    throw new Error(`Unbekanntes Shared-Modul ${unknownFlat.join(', ')} — SHARED_ORDER ergänzen.`);
  }
  const unknownGroups = grouped
    .map((f) => f.split('/')[0])
    .filter((g) => !SHARED_GROUPS.includes(g));
  if (unknownGroups.length > 0) {
    throw new Error(
      `Unbekannte Shared-Gruppe ${unknownGroups.join(', ')} — SHARED_GROUPS ergänzen.`
    );
  }

  const inlinedFlat = SHARED_ORDER.filter((f) => shared.has(f)).map((file) => {
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

  // Gruppen: direkte Imports + transitive Cross-Group-Deps
  // (z. B. content-generate → content-research / ai-providers).
  const groupEntries = new Map();
  for (const f of grouped) {
    const groupName = f.split('/')[0];
    const entry = f.slice(groupName.length + 1);
    if (!groupEntries.has(groupName)) groupEntries.set(groupName, entry);
  }
  for (const [groupName, entry] of [...groupEntries]) {
    collectCrossGroupDeps(groupName, entry, groupEntries);
  }

  const inlinedGroups = SHARED_GROUPS.filter((g) => groupEntries.has(g)).flatMap((groupName) => {
    const entry = groupEntries.get(groupName);
    return resolveSharedGroup(join(FUNCTIONS_DIR, '_shared', groupName), entry, remoteImports);
  });

  const inlined = [...inlinedFlat, ...inlinedGroups];

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
