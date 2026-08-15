// ============================================================
// knowledge-pdf-vision: analyze one PDF page image via OpenRouter
// Model: google/gemini-2.5-flash (existing content vision stack).
// Tenant: membership + x-ascendos-org; forged org denied.
// Does NOT write production knowledge rows — returns structured JSON only.
// ============================================================

import { handleOptions, json } from '../_shared/cors.ts';
import {
  assertClientOrgMatches,
  resolveActiveMembership,
  userClientFromRequest,
} from '../_shared/tenant.ts';
import { fetchWithTimeout } from '../_shared/ai-providers/openai-format.ts';
import {
  OPENROUTER_URL,
  VISION_MODEL,
} from '../_shared/content-generate/types.ts';

const SYSTEM = `You analyze one PDF page image for an organization knowledge base.
Return ONLY a JSON object (no markdown prose) with this shape:
{
  "page_number": <number>,
  "detected_type": "photo|screenshot|diagram|chart|table_image|infographic|scanned_document|logo|other",
  "extracted_text": "<OCR / readable text; empty if none>",
  "visual_summary": "<factual description of visuals; no invented numbers>",
  "tables": [{ "headers": [], "rows": [[]], "caption": null, "page_number": <n>, "confidence": "high|medium|low|needs_review" }],
  "key_facts": ["..."],
  "important_terms": ["..."],
  "confidence": "high|medium|low|needs_review",
  "needs_review": <boolean>
}
Rules:
- Never invent table values you cannot read.
- If unsure, set confidence to needs_review and needs_review true.
- Prefer empty arrays over fabricated content.`;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('vision_json_missing');
  return JSON.parse(raw.slice(start, end + 1));
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

    const { membership: active } = resolved;
    if (active.role !== 'super_admin' && active.role !== 'developer') {
      return json({ error: 'Nur Content-Manager können PDF-Vision nutzen.' }, 403);
    }

    const body = await req.json();
    const bodyOrg =
      body.organization_id ?? body.org_id ?? body.organizationId ?? body.orgId ?? null;
    const orgCheck = assertClientOrgMatches(bodyOrg, active.org_id);
    if (!orgCheck.ok) {
      return json({ error: 'organisation_mismatch' }, 403);
    }

    const pageNumber = Number(body.page_number ?? body.pageNumber ?? 0);
    const imageDataUrl = String(body.image_data_url ?? body.imageDataUrl ?? '').trim();
    if (!pageNumber || pageNumber < 1) {
      return json({ error: 'page_number_required' }, 400);
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      return json({ error: 'image_data_url_required' }, 400);
    }
    // Hard size guard (~4MB base64 payload) — cost + edge memory.
    if (imageDataUrl.length > 5_500_000) {
      return json({ error: 'image_too_large' }, 413);
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return json({ error: 'VISION_FAILED', detail: 'missing_openrouter_key' }, 503);
    }

    let upstreamText = '';
    try {
      const res = await fetchWithTimeout(
        'openrouter',
        OPENROUTER_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ascendos.app',
            'X-Title': 'AscendOS Knowledge PDF Vision',
          },
          body: JSON.stringify({
            model: VISION_MODEL,
            temperature: 0.2,
            max_tokens: 2200,
            messages: [
              { role: 'system', content: SYSTEM },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Analyze PDF page ${pageNumber}. Return structured JSON only.`,
                  },
                  { type: 'image_url', image_url: { url: imageDataUrl } },
                ],
              },
            ],
          }),
        },
        45_000
      );
      const text = await res.text();
      if (!res.ok) {
        console.error('knowledge_pdf_vision_upstream', res.status, text.slice(0, 400));
        return json(
          { error: 'VISION_FAILED', detail: `upstream_${res.status}`, model: VISION_MODEL },
          502
        );
      }
      const parsed = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      upstreamText = parsed.choices?.[0]?.message?.content?.trim() ?? '';
      if (!upstreamText) {
        return json({ error: 'VISION_FAILED', detail: 'empty_vision_content' }, 502);
      }
    } catch (e) {
      console.error('knowledge_pdf_vision_error', e instanceof Error ? e.message : e);
      return json(
        {
          error: 'VISION_FAILED',
          detail: e instanceof Error ? e.message : 'vision_error',
        },
        502
      );
    }

    let structured: unknown;
    try {
      structured = extractJsonObject(upstreamText);
    } catch {
      return json({ error: 'VISION_FAILED', detail: 'vision_json_missing' }, 502);
    }

    return json({
      ok: true,
      org_id: active.org_id,
      model: VISION_MODEL,
      provider: 'openrouter',
      page_number: pageNumber,
      result: structured,
    });
  } catch (e) {
    console.error('knowledge-pdf-vision fatal', e instanceof Error ? e.message : e);
    return json({ error: 'VISION_FAILED', detail: 'internal' }, 500);
  }
});
