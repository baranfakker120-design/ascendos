#!/usr/bin/env node
/**
 * Erzeugt setup/setup-complete.sql aus den echten Quellen:
 *   supabase/migrations/*.sql  (in Dateinamen-Reihenfolge)
 * + setup/bootstrap.sql        (Dashboard-Erstbefüllung)
 *
 * Warum: Die Komplettdatei wurde von Hand nachgeführt. Jede neue
 * Migration, die jemand zu ergänzen vergisst, erzeugt zwei
 * unterschiedliche Datenbanken — lokal korrekt, in Produktion nicht.
 *
 *   node scripts/build-setup-sql.mjs          # schreiben
 *   node scripts/build-setup-sql.mjs --check  # nur prüfen (CI)
 *
 * Reihenfolge ist bewusst: Migrationen zuerst, Bootstrap zuletzt. Der
 * Bootstrap fügt `agents`-Zeilen ein und muss deshalb nach der Migration
 * laufen, die den Modell-Default setzt.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const BOOTSTRAP = join(ROOT, 'setup', 'bootstrap.sql');
const OUT = join(ROOT, 'setup', 'setup-complete.sql');

const HEADER = `-- ============================================================
-- AscendOS — KOMPLETTES SETUP IN EINER DATEI (Mobile Setup Kit)
-- Einfügen in: Supabase Dashboard → SQL Editor → Run.
-- Läuft nur auf einem LEEREN Projekt (Schutz gegen Doppelt-Ausführen).
--
-- GENERIERT von scripts/build-setup-sql.mjs — NICHT von Hand ändern.
-- Quellen: supabase/migrations/*.sql + setup/bootstrap.sql
-- ============================================================

do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'organizations') then
    raise exception 'Setup abgebrochen: Dieses Projekt wurde bereits eingerichtet.';
  end if;
end $$;
`;

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrations.length === 0) throw new Error('Keine Migrationen gefunden.');
if (!existsSync(BOOTSTRAP)) throw new Error(`Bootstrap fehlt: ${BOOTSTRAP}`);

const parts = [HEADER];
for (const file of migrations) {
  parts.push(`\n-- ############ ${file} ############\n${readFileSync(join(MIGRATIONS_DIR, file), 'utf8').trim()}\n`);
}
parts.push('\n' + readFileSync(BOOTSTRAP, 'utf8').trim() + '\n');

const next = parts.join('');
const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;

if (process.argv.includes('--check')) {
  if (current !== next) {
    console.error('✗ setup/setup-complete.sql weicht von den Quellen ab.');
    console.error('  `npm run build:setup-sql` ausführen und committen.');
    process.exit(1);
  }
  console.log(`✓ setup-complete.sql aktuell (${migrations.length} Migrationen)`);
} else {
  writeFileSync(OUT, next);
  console.log(`${current === next ? '=' : '→'} setup/setup-complete.sql (${migrations.length} Migrationen + Bootstrap)`);
}
