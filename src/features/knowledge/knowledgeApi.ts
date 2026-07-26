/**
 * Wissensdatenbank: Datenzugriff und Upload-Pipeline (ADR-029).
 *
 * Ruft ausschließlich die bestehende Edge Function `ingest-knowledge` auf.
 * Chunking und Einbettung passieren dort — hier wird nur extrahierter Text
 * übergeben.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import type { Database } from '@shared/types/database.types';

export type KnowledgeDoc = Database['public']['Tables']['knowledge_docs']['Row'];

/**
 * Die Kategorien sind KEINE freie Texteingabe.
 *
 * `knowledge_docs.category` hat zwar keinen DB-Constraint, aber jeder Agent
 * filtert über `agents.retrieval_categories`. Eine Kategorie außerhalb
 * dieser Liste wird eingebettet, gespeichert — und von KEINEM Agenten je
 * gefunden. Das Dokument wäre stillschweigend wirkungslos, ohne Fehler.
 *
 * Diese Liste ist die Vereinigung der drei Agenten-Konfigurationen. Wird
 * `agents.retrieval_categories` geändert, muss sie mitgeführt werden.
 */
export const CATEGORIES = [
  { value: 'produkte', label: 'Produkte', agents: 'Ascent Wissen + Vertrieb' },
  { value: 'verkauf', label: 'Verkauf', agents: 'Ascent Vertrieb' },
  { value: 'duftparty', label: 'Duftparty', agents: 'Ascent Vertrieb' },
  { value: 'recruiting', label: 'Recruiting', agents: 'Ascent Recruiting' },
  { value: 'einwaende', label: 'Einwände', agents: 'Ascent Recruiting' },
  { value: 'prozess', label: 'Prozesse & Abläufe', agents: 'Recruiting + Wissen' },
  { value: 'verguetung', label: 'Vergütungsplan', agents: 'Ascent Wissen' },
  { value: 'schulung', label: 'Schulung', agents: 'Ascent Wissen' },
  { value: 'faq', label: 'FAQ', agents: 'Ascent Wissen' },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]['value'];

/** Entspricht dem CHECK-Constraint auf `knowledge_docs.source_type`. */
export const SOURCE_TYPES = [
  { value: 'document', label: 'Dokument' },
  { value: 'transcript', label: 'Transkript' },
  { value: 'faq', label: 'FAQ' },
  { value: 'guideline', label: 'Richtlinie' },
  { value: 'best_practice', label: 'Best Practice' },
] as const;

export type SourceTypeValue = (typeof SOURCE_TYPES)[number]['value'];

/**
 * Obergrenze pro Aufruf der Edge Function.
 *
 * Die Function chunkt zu je 1600 Zeichen und bettet SEQUENZIELL ein
 * (gemini-embedding-001 nimmt einen Text pro Request). 120.000 Zeichen
 * sind rund 75 Chunks — genug Luft unter der Laufzeitgrenze. Größere
 * Dokumente werden in Teile zerlegt, statt in einen Timeout zu laufen.
 */
const MAX_CHARS_PER_REQUEST = 120_000;

export interface IngestResponse {
  docId: string;
  chunks: number;
  status: string;
}

/** Zerlegt an Absatzgrenzen, damit kein Chunk mitten im Satz beginnt. */
export function splitForRequests(text: string, limit = MAX_CHARS_PER_REQUEST): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    // Rückwärts die letzte Absatzgrenze im erlaubten Fenster suchen.
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit; // Notfall: hart schneiden
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/** Ein Aufruf der bestehenden Edge Function. */
export async function ingestChunk(input: {
  title: string;
  category: CategoryValue;
  sourceType: SourceTypeValue;
  content: string;
}): Promise<IngestResponse> {
  // Ohne Typargument, wie im restlichen Projekt (coachApi, RegisterPage).
  const { data, error } = await supabase.functions.invoke('ingest-knowledge', {
    body: {
      title: input.title,
      category: input.category,
      sourceType: input.sourceType,
      content: input.content,
    },
  });
  if (error) throw new Error(error.message);
  const res = data as IngestResponse | null;
  if (!res?.docId) throw new Error('Unerwartete Antwort der Ingestion.');
  return res;
}

/**
 * Dokumentliste für die Admin-Seite.
 *
 * Super-Admins sehen laut RLS auch Entwürfe; Berater nur freigegebene.
 * Diese Seite ist super-admin-only, hier kommt also alles zurück.
 */
export function useKnowledgeDocs() {
  return useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: async (): Promise<Array<KnowledgeDoc & { chunk_count: number }>> => {
      const { data, error } = await supabase
        .from('knowledge_docs')
        .select('*, knowledge_chunks(count)')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      type Joined = KnowledgeDoc & { knowledge_chunks: Array<{ count: number }> | null };
      return ((data ?? []) as unknown as Joined[]).map((row) => {
        const { knowledge_chunks: counts, ...doc } = row;
        return { ...doc, chunk_count: counts?.[0]?.count ?? 0 };
      });
    },
  });
}

/**
 * Status ändern.
 *
 * Wichtig fachlich: `ingest-knowledge` legt Dokumente als `draft` an, und
 * `match_knowledge` filtert NICHT selbst auf den Status — die Sperre kommt
 * aus der RLS-Policy `knowledge_docs_select_approved`, weil die Funktion
 * `stable` und nicht `security definer` ist. Für Berater ist ein Entwurf
 * also unsichtbar, für Super-Admins sichtbar. Ohne Freigabe hat das
 * Hochladen für das Team keine Wirkung.
 */
export function useSetDocStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'draft' | 'approved' | 'archived' }) => {
      const { error } = await supabase
        .from('knowledge_docs')
        .update({ status: input.status })
        .eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge-docs'] }),
  });
}

/** Löschen. Chunks hängen per ON DELETE CASCADE am Dokument. */
export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_docs').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge-docs'] }),
  });
}
