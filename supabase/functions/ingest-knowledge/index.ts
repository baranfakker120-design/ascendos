// ============================================================
// ingest-knowledge: Text-Dokument in die Wissensbasis aufnehmen.
// Nur super_admin (membership role). Dokument startet als DRAFT —
// Freigabe ist ein bewusster menschlicher Schritt (ADR-010).
// Phase 5: JWT + x-ascendos-org forwarded; org from membership only.
// ============================================================

import { handleOptions, json } from '../_shared/cors.ts';
import { geminiEmbedBatch, GeminiError } from '../_shared/gemini.ts';
import {
  assertClientOrgMatches,
  resolveActiveMembership,
  userClientFromRequest,
} from '../_shared/tenant.ts';

const CHUNK_SIZE = 1600; // Zeichen (~400 Token), mit Überlappung
const CHUNK_OVERLAP = 200;
/** Chunks pro Verarbeitungsschritt. gemini-embedding-001 nimmt einen Text
 *  pro Request, `geminiEmbedBatch` arbeitet also sequenziell mit Backoff.
 *  Kleinere Schritte heißen: häufigere DB-Inserts, aber bei einem Abbruch
 *  weniger verlorene Arbeit und weniger Druck auf das Free-Tier-Limit. */
const EMBED_BATCH = 16;
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
    const db = userClientFromRequest(req);
    const resolved = await resolveActiveMembership(db, req);
    if (!resolved.ok) {
      if (resolved.status === 401) return json({ error: 'Nicht angemeldet.' }, 401);
      return json({ error: 'Keine aktive Organisationsmitgliedschaft.' }, 403);
    }

    const { userId, membership: active } = resolved;
    if (active.role !== 'super_admin') {
      return json({ error: 'Nur Super-Admins können Wissen aufnehmen.' }, 403);
    }

    const body = await req.json();
    // Client-supplied organization_id / org_id is never authoritative.
    const bodyOrg =
      body.organization_id ?? body.org_id ?? body.organizationId ?? body.orgId ?? null;
    const orgCheck = assertClientOrgMatches(bodyOrg, active.org_id);
    if (!orgCheck.ok) {
      return json({ error: 'organisation_mismatch' }, 403);
    }

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

    const { data: doc, error: docError } = await db
      .from('knowledge_docs')
      .insert({
        org_id: active.org_id,
        team_id: teamId,
        title,
        category,
        author_id: userId,
        source_type: body.sourceType ?? 'document',
        status: 'draft',
      })
      .select()
      .single();
    if (docError) throw docError;

    const chunks = chunkText(content);

    // Schlägt die Einbettung mitten im Dokument fehl, bliebe ein Doc mit
    // halber Wissensbasis zurück — schlimmer als kein Doc, weil der Coach
    // es später als vollständig behandelt. Deshalb aufräumen.
    try {
      for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
        const slice = chunks.slice(start, start + EMBED_BATCH);
        // RETRIEVAL_DOCUMENT: Gegenstück zu RETRIEVAL_QUERY in coach-chat.
        const vectors = await geminiEmbedBatch(slice, 'RETRIEVAL_DOCUMENT');
        const rows = slice.map((text, i) => ({
          doc_id: doc.id,
          org_id: active.org_id,
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
      orgId: active.org_id,
      hint: 'Dokument ist als Entwurf gespeichert. Erst nach Freigabe (status = approved) nutzt der Coach es.',
    });
  } catch (e) {
    // super_admin-only: hier hilft die konkrete Ursache mehr als eine
    // generische Meldung.
    if (e instanceof GeminiError) {
      console.error(`ingest-knowledge llm error [${e.code}]`, e.message);
      return json(
        { error: `Einbettung fehlgeschlagen (${e.code}).` },
        e.code === 'missing_api_key' ? 503 : 502
      );
    }
    console.error('ingest-knowledge error', e instanceof Error ? e.message : e);
    return json({ error: 'Aufnahme fehlgeschlagen.' }, 500);
  }
});
