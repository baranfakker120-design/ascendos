import { createClient } from '@supabase/supabase-js';
import { env } from '@shared/config/env';
import type { Database } from '@shared/types/database.types';

/**
 * Selektor der aktiven Organisation, Sprint 2c.
 *
 * F2 Teil 1.3: Die aktive Organisation ist ein SELEKTOR, keine
 * Berechtigung. Sie sagt, WELCHE Mitgliedschaft betrachtet wird, nicht
 * OB sie zusteht. Die Gültigkeit prüft `active_membership_id()` in der
 * Datenbank gegen die aktiven Mitgliedschaften. Deshalb darf der Wert
 * vom Client kommen, ohne dass daraus ein Vertrauensproblem entsteht:
 * Der Client wählt eine Sichtweise, der Server entscheidet.
 *
 * Solange eine Identität genau eine aktive Mitgliedschaft hat, bleibt
 * der Wert null und Fall 3 der Auflösungsregel greift. Der Kopf wird
 * dann nicht gesetzt.
 *
 * Absichtlich nur im Speicher, nicht dauerhaft abgelegt: Eine dauerhafte
 * Ablage gehört zum Organisationswechsler der Oberfläche (F4, Änderung
 * Ä1) und damit in einen eigenen Schritt.
 */
let activeOrgId: string | null = null;

export function setActiveOrg(orgId: string | null): void {
  activeOrgId = orgId;
}

export function getActiveOrg(): string | null {
  return activeOrgId;
}

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // Der Kopf muss zur Anfragezeit gesetzt werden, nicht zur
    // Erzeugungszeit des Clients: Ein Organisationswechsel soll ohne
    // Neuerzeugung wirken.
    fetch: (input, init) => {
      if (!activeOrgId) return fetch(input, init);
      const headers = new Headers(init?.headers);
      headers.set('x-ascendos-org', activeOrgId);
      return fetch(input, { ...init, headers });
    },
  },
});
