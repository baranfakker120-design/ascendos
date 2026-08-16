/**
 * Knowledge Center PDF Vision pipeline (CMS draft → optional Coach RAG).
 * Uses private knowledge-pdfs bucket + knowledge-pdf-vision edge function.
 * Never auto-publishes; never mutates existing articles/chunks unless user opts in.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import type { Json } from '@shared/types/database.types';
import { ingestChunk, type CategoryValue } from '@features/knowledge/knowledgeApi';
import { extractKnowledgePdfPages, summarizeExtractStats } from './pdf/extractPages';
import {
  assertKnowledgePdfOrgMatch,
  buildKnowledgePdfObjectPath,
  KNOWLEDGE_PDF_BUCKET,
  knowledgePdfPathBelongsToOrg,
} from './pdf/knowledgePdfStorage';
import { pagesToReviewMarkdown, type KnowledgePdfPageChunkSource } from './pdf/semanticChunk';
import { parseKnowledgePdfVisionResult } from './pdf/visionSchema';
import { sha256HexOfBlob, normalizePdfFilename } from './pdf/contentHash';
import { decideKnowledgePdfFastScan, type FastScanMatch } from './pdf/fastScan';
import { resolveKnowledgeSyncStatus } from './pdf/knowledgeSyncStatus';
import { buildKnowledgePdfExtractionFailureUpdate } from './pdf/pipelineStatus';
import type { KnowledgePdfDocument, KnowledgePdfPage } from './pdf/types';

export type ProcessPdfResult = {
  documentId: string;
  page_count: number;
  text_page_count: number;
  vision_page_count: number;
  image_page_count: number;
  table_count: number;
  fast_scan_result: string;
  skipped_deep_analysis: boolean;
  sync: ReturnType<typeof resolveKnowledgeSyncStatus>;
};

async function createSignedKnowledgePdfUrl(path: string, expiresSec = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_PDF_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'signed_url_failed');
  }
  return data.signedUrl;
}

async function analyzePageVision(params: {
  pageNumber: number;
  imageDataUrl: string;
  activeOrgId: string;
}): Promise<ReturnType<typeof parseKnowledgePdfVisionResult>> {
  const { data, error } = await supabase.functions.invoke('knowledge-pdf-vision', {
    body: {
      page_number: params.pageNumber,
      image_data_url: params.imageDataUrl,
      organization_id: params.activeOrgId,
    },
  });
  if (error) throw new Error(error.message || 'VISION_FAILED');
  const payload = data as {
    error?: string;
    detail?: string;
    result?: unknown;
    page_number?: number;
  } | null;
  if (!payload || payload.error) {
    throw new Error(
      payload?.error === 'VISION_FAILED' ? 'VISION_FAILED' : payload?.error || 'VISION_FAILED'
    );
  }
  return parseKnowledgePdfVisionResult(payload.result, params.pageNumber);
}

export function useKnowledgePdfDocuments() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['knowledge-pdf-documents', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<KnowledgePdfDocument[]> => {
      const { data, error } = await supabase
        .from('knowledge_pdf_documents')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as KnowledgePdfDocument[];
    },
  });
}

export function useKnowledgePdfPages(documentId: string | null) {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['knowledge-pdf-pages', orgId, documentId],
    enabled: Boolean(orgId) && Boolean(documentId),
    queryFn: async (): Promise<KnowledgePdfPage[]> => {
      const { data, error } = await supabase
        .from('knowledge_pdf_pages')
        .select('*')
        .eq('document_id', documentId!)
        .order('page_number', { ascending: true });
      if (error) throw error;
      return (data ?? []) as KnowledgePdfPage[];
    },
  });
}

export function useKnowledgePdfPipeline() {
  const { membership, profile } = useAuth();
  const qc = useQueryClient();
  const activeOrgId = membership?.org_id ?? null;

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['knowledge-pdf-documents'] }),
      qc.invalidateQueries({ queryKey: ['knowledge-pdf-pages'] }),
      qc.invalidateQueries({ queryKey: ['coach-knowledge-articles'] }),
    ]);
  };

  const processPdf = useMutation({
    mutationFn: async (file: File): Promise<ProcessPdfResult> => {
      if (!activeOrgId) throw new Error('org_required');
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('pdf_required');
      }

      const orgCheck = assertKnowledgePdfOrgMatch(activeOrgId, activeOrgId);
      if (!orgCheck.ok) throw new Error('organisation_mismatch');

      // Phase A — Fast Scan (hash + org-local duplicate / version hints)
      const contentSha256 = await sha256HexOfBlob(file);
      const byteSize = file.size;

      const { data: hashRows, error: hashErr } = await supabase
        .from('knowledge_pdf_documents')
        .select('id, source_filename, content_sha256, status, title')
        .eq('org_id', activeOrgId)
        .eq('content_sha256', contentSha256)
        .not('status', 'in', '("failed","archived","uploading")')
        .limit(1);
      if (hashErr) throw hashErr;
      const exactHashMatch = (hashRows?.[0] as FastScanMatch | undefined) ?? null;

      const { data: nameRows, error: nameErr } = await supabase
        .from('knowledge_pdf_documents')
        .select('id, source_filename, content_sha256, status, title')
        .eq('org_id', activeOrgId)
        .ilike('source_filename', file.name)
        .not('status', 'in', '("failed","archived","uploading")')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (nameErr) throw nameErr;
      const sameFilenameMatch = (nameRows?.[0] as FastScanMatch | undefined) ?? null;

      const fastScan = decideKnowledgePdfFastScan({
        contentSha256,
        sourceFilename: normalizePdfFilename(file.name),
        exactHashMatch,
        sameFilenameMatch:
          sameFilenameMatch &&
          normalizePdfFilename(sameFilenameMatch.source_filename) ===
            normalizePdfFilename(file.name)
            ? sameFilenameMatch
            : null,
      });

      if (fastScan.skipDeepAnalysis && fastScan.matchId) {
        const { data: existing, error: existingErr } = await supabase
          .from('knowledge_pdf_documents')
          .select('*')
          .eq('id', fastScan.matchId)
          .single();
        if (existingErr || !existing) throw existingErr ?? new Error('duplicate_lookup_failed');
        const existingDoc = existing as KnowledgePdfDocument;
        return {
          documentId: existingDoc.id,
          page_count: existingDoc.page_count,
          text_page_count: existingDoc.text_page_count,
          vision_page_count: existingDoc.vision_page_count,
          image_page_count: existingDoc.image_page_count,
          table_count: existingDoc.table_count,
          fast_scan_result: 'exact_duplicate',
          skipped_deep_analysis: true,
          sync: resolveKnowledgeSyncStatus({
            articleId: existingDoc.article_id,
            ragDocId: existingDoc.rag_doc_id,
            coachRagEnabled: existingDoc.coach_rag_enabled,
          }),
        };
      }

      const storagePath = buildKnowledgePdfObjectPath(activeOrgId, profile?.id ?? null, file.name);
      if (!knowledgePdfPathBelongsToOrg(storagePath, activeOrgId)) {
        throw new Error('storage_path_org_mismatch');
      }

      const { error: upErr } = await supabase.storage
        .from(KNOWLEDGE_PDF_BUCKET)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      const title = file.name.replace(/\.[^.]+$/, '');
      const { data: doc, error: docErr } = await supabase
        .from('knowledge_pdf_documents')
        .insert({
          org_id: activeOrgId,
          source_filename: file.name,
          storage_path: storagePath,
          title,
          status: 'extracting',
          content_sha256: contentSha256,
          byte_size: byteSize,
          fast_scan_result: fastScan.result,
          duplicate_of_id: fastScan.matchId,
          created_by: profile?.id ?? null,
          updated_by: profile?.id ?? null,
        })
        .select('*')
        .single();
      if (docErr || !doc) throw docErr ?? new Error('document_create_failed');
      const document = doc as KnowledgePdfDocument;

      let pages;
      let pageCount: number;
      try {
        ({ pages, pageCount } = await extractKnowledgePdfPages(file));
      } catch (extractErr) {
        const failure = buildKnowledgePdfExtractionFailureUpdate(extractErr, profile?.id ?? null);
        await supabase.from('knowledge_pdf_documents').update(failure).eq('id', document.id);
        throw extractErr instanceof Error ? extractErr : new Error(failure.error_message);
      }
      const stats = summarizeExtractStats(pages);

      await supabase
        .from('knowledge_pdf_documents')
        .update({
          status: 'analyzing',
          page_count: pageCount,
          text_page_count: stats.text_page_count,
          vision_page_count: stats.vision_page_count,
          image_page_count: stats.image_page_count,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      const pageRows: Array<{
        org_id: string;
        document_id: string;
        page_number: number;
        page_type: string;
        section: string | null;
        extracted_text: string;
        visual_summary: string | null;
        table_data: Json;
        key_facts: Json;
        important_terms: Json;
        image_detected: boolean;
        vision_used: boolean;
        vision_confidence: string | null;
        needs_review: boolean;
        error_message: string | null;
      }> = [];
      let tableCount = 0;
      let visionFailed = false;
      let visionError: string | null = null;

      for (const page of pages) {
        let extracted = page.extracted_text;
        let visual: string | null = null;
        let tables: Json = [];
        let keyFacts: Json = [];
        let terms: Json = [];
        let visionUsed = false;
        let confidence: string | null = null;
        let needsReview = false;
        let pageError: string | null = null;

        if (page.needsVision) {
          if (!page.visionImageDataUrl) {
            visionFailed = true;
            visionError = 'VISION_FAILED';
            pageError = 'render_failed';
            needsReview = true;
          } else {
            try {
              const vision = await analyzePageVision({
                pageNumber: page.page_number,
                imageDataUrl: page.visionImageDataUrl,
                activeOrgId,
              });
              visionUsed = true;
              if (vision.extracted_text) {
                extracted = extracted
                  ? `${extracted}\n\n${vision.extracted_text}`
                  : vision.extracted_text;
              }
              visual = vision.visual_summary || null;
              tables = vision.tables as unknown as Json;
              keyFacts = vision.key_facts as unknown as Json;
              terms = vision.important_terms as unknown as Json;
              confidence = vision.confidence;
              needsReview = vision.needs_review;
              tableCount += vision.tables.length;
            } catch (e) {
              visionFailed = true;
              visionError = e instanceof Error ? e.message : 'VISION_FAILED';
              pageError = visionError;
              needsReview = true;
            }
          }
        }

        pageRows.push({
          org_id: activeOrgId,
          document_id: document.id,
          page_number: page.page_number,
          page_type: page.page_type,
          section: null,
          extracted_text: extracted,
          visual_summary: visual,
          table_data: tables,
          key_facts: keyFacts,
          important_terms: terms,
          image_detected: page.image_detected,
          vision_used: visionUsed,
          vision_confidence: confidence,
          needs_review: needsReview,
          error_message: pageError,
        });
      }

      if (pageRows.length) {
        const { error: pagesErr } = await supabase.from('knowledge_pdf_pages').insert(pageRows);
        if (pagesErr) throw pagesErr;
      }

      if (visionFailed) {
        await supabase
          .from('knowledge_pdf_documents')
          .update({
            status: 'vision_failed',
            error_message: visionError || 'VISION_FAILED',
            table_count: tableCount,
            updated_by: profile?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', document.id);
        throw new Error('VISION_FAILED');
      }

      await supabase
        .from('knowledge_pdf_documents')
        .update({
          status: 'structuring',
          table_count: tableCount,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      await supabase
        .from('knowledge_pdf_documents')
        .update({
          status: 'ready_for_review',
          error_message: null,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      return {
        documentId: document.id,
        ...stats,
        table_count: tableCount,
        fast_scan_result: fastScan.result,
        skipped_deep_analysis: false,
        sync: resolveKnowledgeSyncStatus({
          articleId: document.article_id,
          ragDocId: document.rag_doc_id,
          coachRagEnabled: document.coach_rag_enabled,
        }),
      };
    },
    onSuccess: () => void invalidate(),
    onError: () => void invalidate(),
  });

  const approveToCms = useMutation({
    mutationFn: async (params: { documentId: string; category: string }) => {
      if (!activeOrgId) throw new Error('org_required');
      const { data: doc, error: docErr } = await supabase
        .from('knowledge_pdf_documents')
        .select('*')
        .eq('id', params.documentId)
        .single();
      if (docErr || !doc) throw docErr ?? new Error('document_missing');
      const document = doc as KnowledgePdfDocument;
      if (document.org_id !== activeOrgId) throw new Error('organisation_mismatch');

      const { data: pages, error: pagesErr } = await supabase
        .from('knowledge_pdf_pages')
        .select('*')
        .eq('document_id', params.documentId)
        .order('page_number', { ascending: true });
      if (pagesErr) throw pagesErr;

      const sources: KnowledgePdfPageChunkSource[] = ((pages ?? []) as KnowledgePdfPage[]).map(
        (p) => ({
          page_number: p.page_number,
          page_type: p.page_type,
          section: p.section,
          extracted_text: p.extracted_text,
          visual_summary: p.visual_summary,
          table_data: (Array.isArray(p.table_data) ? p.table_data : []) as never,
          key_facts: (Array.isArray(p.key_facts) ? p.key_facts : []) as string[],
          important_terms: (Array.isArray(p.important_terms) ? p.important_terms : []) as string[],
          source_filename: document.source_filename,
          source_document_id: document.id,
          organization_id: activeOrgId,
        })
      );

      const bodyMarkdown = pagesToReviewMarkdown(sources);
      const slugBase = document.title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .slice(0, 60);
      const slug = `${slugBase || 'pdf'}-${Date.now().toString(36)}`;

      const { data: article, error: artErr } = await supabase
        .from('coach_knowledge_articles')
        .insert({
          org_id: activeOrgId,
          title: document.title || document.source_filename,
          slug,
          body_markdown: bodyMarkdown,
          body_html: '',
          category: params.category,
          tags: ['pdf', 'vision'],
          status: 'draft',
          active: false,
          created_by: profile?.id ?? null,
          updated_by: profile?.id ?? null,
        })
        .select('*')
        .single();
      if (artErr || !article) throw artErr ?? new Error('article_create_failed');

      await supabase.from('coach_knowledge_versions').insert({
        article_id: article.id,
        version: 1,
        title: article.title,
        body_markdown: bodyMarkdown,
        body_html: '',
        category: params.category,
        tags: ['pdf', 'vision'],
        status: 'draft',
        change_summary: `PDF ingest: ${document.source_filename}`,
        created_by: profile?.id ?? null,
      });

      await supabase
        .from('knowledge_pdf_documents')
        .update({
          status: 'approved',
          article_id: article.id,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      return { articleId: article.id as string, bodyMarkdown };
    },
    onSuccess: () => void invalidate(),
  });

  /** Explicit opt-in only — never called automatically from upload. */
  const enableCoachRag = useMutation({
    mutationFn: async (params: { documentId: string; category: CategoryValue }) => {
      if (!activeOrgId) throw new Error('org_required');
      const { data: doc, error: docErr } = await supabase
        .from('knowledge_pdf_documents')
        .select('*')
        .eq('id', params.documentId)
        .single();
      if (docErr || !doc) throw docErr ?? new Error('document_missing');
      const document = doc as KnowledgePdfDocument;
      if (document.org_id !== activeOrgId) throw new Error('organisation_mismatch');
      if (!document.article_id) throw new Error('approve_cms_first');

      const { data: article, error: aErr } = await supabase
        .from('coach_knowledge_articles')
        .select('title, body_markdown')
        .eq('id', document.article_id)
        .single();
      if (aErr || !article) throw aErr ?? new Error('article_missing');

      const ingest = await ingestChunk({
        title: article.title,
        category: params.category,
        sourceType: 'document',
        content: article.body_markdown,
      });

      await supabase
        .from('knowledge_pdf_documents')
        .update({
          coach_rag_enabled: true,
          rag_doc_id: ingest.docId,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      return ingest;
    },
    onSuccess: () => void invalidate(),
  });

  const previewSignedUrl = useMutation({
    mutationFn: async (storagePath: string) => {
      if (!activeOrgId) throw new Error('org_required');
      if (!knowledgePdfPathBelongsToOrg(storagePath, activeOrgId)) {
        throw new Error('organisation_mismatch');
      }
      return createSignedKnowledgePdfUrl(storagePath);
    },
  });

  return { processPdf, approveToCms, enableCoachRag, previewSignedUrl };
}
