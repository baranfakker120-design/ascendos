/**
 * Semantic-ish chunking for Knowledge PDF pages (pure).
 * Prefers page / section / table / visual boundaries over raw character slicing.
 */

import type { KnowledgePdfPageType } from './pageClassify';
import type { KnowledgePdfTableData } from './visionSchema';

export interface KnowledgePdfPageChunkSource {
  page_number: number;
  page_type: KnowledgePdfPageType;
  section?: string | null;
  extracted_text: string;
  visual_summary?: string | null;
  table_data?: KnowledgePdfTableData[];
  key_facts?: string[];
  important_terms?: string[];
  source_filename: string;
  source_document_id: string;
  organization_id: string;
}

export interface KnowledgePdfChunk {
  content: string;
  metadata: {
    organization_id: string;
    source_document_id: string;
    page_number: number;
    section: string | null;
    source_type: 'knowledge_pdf';
    page_type: KnowledgePdfPageType;
    chunk_kind: 'text' | 'visual' | 'table' | 'facts';
    source_filename: string;
  };
}

function pushChunk(
  out: KnowledgePdfChunk[],
  src: KnowledgePdfPageChunkSource,
  kind: KnowledgePdfChunk['metadata']['chunk_kind'],
  body: string
) {
  const content = body.trim();
  if (!content) return;
  out.push({
    content,
    metadata: {
      organization_id: src.organization_id,
      source_document_id: src.source_document_id,
      page_number: src.page_number,
      section: src.section ?? null,
      source_type: 'knowledge_pdf',
      page_type: src.page_type,
      chunk_kind: kind,
      source_filename: src.source_filename,
    },
  });
}

export function buildPageChunks(src: KnowledgePdfPageChunkSource): KnowledgePdfChunk[] {
  const out: KnowledgePdfChunk[] = [];
  const header = [
    `Source: ${src.source_filename}`,
    `Page: ${src.page_number}`,
    src.section ? `Section: ${src.section}` : null,
    `Type: ${src.page_type}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (src.extracted_text.trim()) {
    pushChunk(out, src, 'text', `${header}\n\n${src.extracted_text.trim()}`);
  }
  if (src.visual_summary?.trim()) {
    pushChunk(out, src, 'visual', `${header}\n\nVisual context:\n${src.visual_summary.trim()}`);
  }
  for (const table of src.table_data ?? []) {
    const lines = [
      header,
      'Table:',
      table.caption ? `Caption: ${table.caption}` : null,
      table.headers.length ? `Headers: ${table.headers.join(' | ')}` : null,
      ...table.rows.map((r) => r.join(' | ')),
    ].filter(Boolean);
    pushChunk(out, src, 'table', lines.join('\n'));
  }
  const facts = [...(src.key_facts ?? []), ...(src.important_terms ?? [])].filter(Boolean);
  if (facts.length) {
    pushChunk(out, src, 'facts', `${header}\n\nKey facts / terms:\n- ${facts.join('\n- ')}`);
  }
  return out;
}

export function buildDocumentChunks(pages: KnowledgePdfPageChunkSource[]): KnowledgePdfChunk[] {
  return pages.flatMap(buildPageChunks);
}

/** Flatten chunks into review markdown for CMS draft (not auto-publish). */
export function pagesToReviewMarkdown(pages: KnowledgePdfPageChunkSource[]): string {
  return pages
    .map((p) => {
      const parts = [
        `## Page ${p.page_number}${p.section ? ` — ${p.section}` : ''}`,
        `_Type: ${p.page_type}_`,
        p.extracted_text.trim() || null,
        p.visual_summary?.trim() ? `### Visual\n${p.visual_summary.trim()}` : null,
        (p.table_data?.length ?? 0) > 0
          ? `### Tables\n${(p.table_data ?? [])
              .map((t) => {
                const head = t.headers.length
                  ? `| ${t.headers.join(' | ')} |\n| ${t.headers.map(() => '---').join(' | ')} |`
                  : '';
                const body = t.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
                return [t.caption ? `**${t.caption}**` : null, head, body]
                  .filter(Boolean)
                  .join('\n');
              })
              .join('\n\n')}`
          : null,
        (p.key_facts?.length ?? 0) > 0
          ? `### Key facts\n${(p.key_facts ?? []).map((f) => `- ${f}`).join('\n')}`
          : null,
      ].filter(Boolean);
      return parts.join('\n\n');
    })
    .join('\n\n---\n\n');
}
