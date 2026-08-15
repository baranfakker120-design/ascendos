import type { Json } from '@shared/types/database.types';
import type { KnowledgePdfPageType } from './pageClassify';
import type { KnowledgePdfStatus } from './pipelineStatus';
import type { KnowledgePdfTableData, VisionConfidence } from './visionSchema';

export type KnowledgePdfDocument = {
  id: string;
  org_id: string;
  source_filename: string;
  storage_path: string;
  title: string;
  status: KnowledgePdfStatus;
  page_count: number;
  text_page_count: number;
  vision_page_count: number;
  table_count: number;
  image_page_count: number;
  error_message: string | null;
  article_id: string | null;
  rag_doc_id: string | null;
  coach_rag_enabled: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgePdfPage = {
  id: string;
  org_id: string;
  document_id: string;
  page_number: number;
  page_type: KnowledgePdfPageType;
  section: string | null;
  extracted_text: string;
  visual_summary: string | null;
  table_data: KnowledgePdfTableData[] | Json;
  key_facts: string[] | Json;
  important_terms: string[] | Json;
  image_detected: boolean;
  vision_used: boolean;
  vision_confidence: VisionConfidence | null;
  needs_review: boolean;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
