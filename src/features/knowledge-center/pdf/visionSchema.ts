/**
 * Structured Vision output for Knowledge PDF pages (pure parse/validate).
 */

export type VisionConfidence = 'high' | 'medium' | 'low' | 'needs_review';

export interface KnowledgePdfTableData {
  headers: string[];
  rows: string[][];
  caption?: string | null;
  page_number: number;
  confidence?: VisionConfidence;
}

export interface KnowledgePdfVisionResult {
  page_number: number;
  detected_type: string;
  extracted_text: string;
  visual_summary: string;
  tables: KnowledgePdfTableData[];
  key_facts: string[];
  important_terms: string[];
  confidence: VisionConfidence;
  needs_review: boolean;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}

function asConfidence(v: unknown): VisionConfidence {
  if (v === 'high' || v === 'medium' || v === 'low' || v === 'needs_review') return v;
  return 'needs_review';
}

function asTables(v: unknown, pageNumber: number): KnowledgePdfTableData[] {
  if (!Array.isArray(v)) return [];
  const out: KnowledgePdfTableData[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const headers = asStringArray(row.headers);
    const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
    const rows: string[][] = [];
    for (const r of rowsRaw) {
      if (Array.isArray(r)) rows.push(r.map((c) => asString(c)));
      else if (typeof r === 'string') rows.push([r.trim()]);
    }
    out.push({
      headers,
      rows,
      caption: asString(row.caption) || null,
      page_number:
        typeof row.page_number === 'number' && row.page_number > 0 ? row.page_number : pageNumber,
      confidence: asConfidence(row.confidence),
    });
  }
  return out;
}

/** Extract first JSON object from model text (fences allowed). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('vision_json_missing');
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

export function parseKnowledgePdfVisionResult(
  raw: unknown,
  pageNumber: number
): KnowledgePdfVisionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('vision_result_invalid');
  }
  const o = raw as Record<string, unknown>;
  const confidence = asConfidence(o.confidence ?? o.vision_confidence);
  const needsReview =
    o.needs_review === true || confidence === 'needs_review' || confidence === 'low';
  return {
    page_number:
      typeof o.page_number === 'number' && o.page_number > 0 ? o.page_number : pageNumber,
    detected_type: asString(o.detected_type) || 'unknown',
    extracted_text: asString(o.extracted_text),
    visual_summary: asString(o.visual_summary),
    tables: asTables(o.tables ?? o.table_data, pageNumber),
    key_facts: asStringArray(o.key_facts),
    important_terms: asStringArray(o.important_terms),
    confidence,
    needs_review: needsReview,
  };
}

export function parseVisionModelText(
  modelText: string,
  pageNumber: number
): KnowledgePdfVisionResult {
  return parseKnowledgePdfVisionResult(extractJsonObject(modelText), pageNumber);
}

export const KNOWLEDGE_PDF_VISION_SYSTEM = `You analyze one PDF page image for an organization knowledge base.
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
