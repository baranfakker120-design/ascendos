#!/usr/bin/env node
/**
 * Batch-Ingestion für die Wissensbasis (Sprint 4.5).
 *
 * Statt 20x manuell die Function aufzurufen: Ordner mit Markdown-Dateien
 * anlegen, Dateiname = "<kategorie>__<titel>.md", Skript laden lassen.
 *
 * Beispiel:
 *   wissen/
 *     prozess__Follow-up-Rhythmus.md
 *     einwaende__Top-10-Einwaende.md
 *     duftparty__Duftparty-Ablauf.md
 *
 * Nutzung:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   ASCENDOS_EMAIL=admin@... ASCENDOS_PASSWORD=... \
 *   node scripts/ingest-knowledge.mjs ./wissen
 *
 * Alle Dokumente landen als DRAFT — Freigabe bleibt ein bewusster
 * menschlicher Schritt (ADR-010).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [, , folder] = process.argv;
const { SUPABASE_URL, SUPABASE_ANON_KEY, ASCENDOS_EMAIL, ASCENDOS_PASSWORD } = process.env;

if (!folder || !SUPABASE_URL || !SUPABASE_ANON_KEY || !ASCENDOS_EMAIL || !ASCENDOS_PASSWORD) {
  console.error(
    'Nutzung: SUPABASE_URL=... SUPABASE_ANON_KEY=... ASCENDOS_EMAIL=... ASCENDOS_PASSWORD=... node scripts/ingest-knowledge.mjs <ordner>'
  );
  process.exit(1);
}

// Login als Admin (Passwort kommt aus der Umgebung, nie aus dem Repo)
const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ASCENDOS_EMAIL, password: ASCENDOS_PASSWORD }),
});
if (!authRes.ok) {
  console.error('Login fehlgeschlagen:', await authRes.text());
  process.exit(1);
}
const { access_token } = await authRes.json();

const files = readdirSync(folder).filter((f) => f.endsWith('.md'));
if (files.length === 0) {
  console.error(`Keine .md-Dateien in ${folder} gefunden.`);
  process.exit(1);
}

console.log(`${files.length} Dokument(e) gefunden.\n`);
let ok = 0;

for (const file of files) {
  const name = basename(file, '.md');
  const [category, ...titleParts] = name.split('__');
  const title = titleParts.join('__').replaceAll('-', ' ').trim();
  if (!category || !title) {
    console.error(`✗ ${file}: Dateiname muss "<kategorie>__<titel>.md" sein — übersprungen.`);
    continue;
  }
  const content = readFileSync(join(folder, file), 'utf8');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-knowledge`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, category, content }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    ok += 1;
    console.log(`✓ ${title} (${category}) — ${body.chunks} Chunk(s), Status: draft`);
  } else {
    console.error(`✗ ${title}: ${body.error ?? res.status}`);
  }
}

console.log(
  `\nFertig: ${ok}/${files.length} aufgenommen.\n` +
    'Nächster Schritt: In Supabase Studio prüfen und pro Dokument status = approved setzen —\n' +
    'erst dann nutzt der Coach das Wissen (ADR-010).'
);
