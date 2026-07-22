// ============================================================
// ingest-knowledge: Text-Dokument in die Wissensbasis aufnehmen.
// Nur super_admin. Dokument startet als DRAFT — Freigabe ist ein
// bewusster menschlicher Schritt (ADR-010), aktuell via Studio,
// Admin-UI folgt in Sprint 5.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { embedBatch, LlmError } from '../_shared/llm.ts';

const CHUNK_SIZE = 1600; // Zeichen (~400 Token), mit Überlappung
const CHUNK_OVERLAP = 200;
/** Embeddings gebündelt anfragen: 1 Roundtrip statt 1 pro Chunk. Ohne das
 *  läuft ein großes Dokument in die Laufzeitgrenze der Function. */
const EMBED_BATCH = 64;
/** Schutz vor versehentlichen Riesen-Uploads (Kosten + Laufzeit). */
const MAX_CONTENT_CHARS = 400_000;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    // möglichst an Absatz-/Satzgrenze schneiden
    const slice = clean.slice(start, end);
    const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
    if (end < clean.length && cut > CHUNK_SIZE * 0.5) end = start + cut + 1;
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: userData } = await db.auth.getUser();
    if (!userData.user) return json({ error: 'Nicht angemeldet.' }, 401);

    const { data: profile } = await db.from('profiles')
      .select('*').eq('id', userData.user.id).single();
    if (profile?.role !== 'super_admin') {
      return json({ error: 'Nur Super-Admins können Wissen aufnehmen.' }, 403);
    }

    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const category = String(body.category ?? '').trim();
    const content = String(body.content ?? '').trim();
    const teamId = body.teamId ? String(body.teamId) : null;
    if (!title || !category || !content) {
      return json({ error: 'title, category und content sind erforderlich.' }, 400);
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return json(
        {
          error: `Dokument zu groß (${content.length} Zeichen, max. ${MAX_CONTENT_CHARS}). Bitte aufteilen.`,
        },
        413
      );
    }

    const { data: doc, error: docError } = await db.from('knowledge_docs')
      .insert({
        org_id: profile.org_id,
        team_id: teamId,
        title,
        category,
        author_id: profile.id,
        source_type: body.sourceType ?? 'document',
        status: 'draft',
      })
      .select().single();
    if (docError) throw docError;

    const chunks = chunkText(content);

    // Schlägt die Einbettung mitten im Dokument fehl, bliebe ein Doc mit
    // halber Wissensbasis zurück — schlimmer als kein Doc, weil der Coach
    // es später als vollständig behandelt. Deshalb aufräumen.
    try {
      for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
        const slice = chunks.slice(start, start + EMBED_BATCH);
        const vectors = await embedBatch(slice);
        const rows = slice.map((text, i) => ({
          doc_id: doc.id,
          org_id: profile.org_id,
          chunk_index: start + i,
          content: text,
          embedding: vectors[i],
        }));
        const { error } = await db.from('knowledge_chunks').insert(rows);
        if (error) throw error;
      }
    } catch (e) {
      await db.from('knowledge_docs').delete().eq('id', doc.id);
      throw e;
    }

    return json({
      docId: doc.id,
      chunks: chunks.length,
      status: 'draft',
      hint: 'Dokument ist als Entwurf gespeichert. Erst nach Freigabe (status = approved) nutzt der Coach es.',
    });
  } catch (e) {
    // super_admin-only: hier hilft die konkrete Ursache mehr als eine
    // generische Meldung.
    if (e instanceof LlmError) {
      console.error(`ingest-knowledge llm error [${e.code}]`, e.message);
      return json({ error: `Einbettung fehlgeschlagen (${e.code}).` },
        e.code === 'missing_api_key' ? 503 : 502);
    }
    console.error('ingest-knowledge error', e instanceof Error ? e.message : e);
    return json({ error: 'Aufnahme fehlgeschlagen.' }, 500);
  }
});
