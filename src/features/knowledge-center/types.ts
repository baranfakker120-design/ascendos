import type { Json } from '@shared/types/database.types';

export type KnowledgeArticleStatus = 'draft' | 'needs_review' | 'approved' | 'archived';

export type ContradictionKind =
  'outdated_number' | 'conflicting_rule' | 'duplicate' | 'missing_information';

export interface ContradictionFlag {
  kind: ContradictionKind;
  severity: 'info' | 'warning' | 'blocker';
  message: string;
  evidence?: string;
}

export interface CoachKnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  body_markdown: string;
  body_html: string;
  category: string;
  tags: string[];
  status: KnowledgeArticleStatus;
  contradiction_flags: ContradictionFlag[] | Json;
  contradiction_summary: string | null;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface CoachKnowledgeVersion {
  id: string;
  article_id: string;
  version: number;
  title: string;
  body_markdown: string;
  body_html: string;
  category: string;
  tags: string[];
  status: string;
  change_summary: string | null;
  contradiction_flags: ContradictionFlag[] | Json;
  created_by: string | null;
  created_at: string;
}

export interface CoachKnowledgeChangeLog {
  id: string;
  article_id: string;
  version: number | null;
  action: string;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

export const KNOWLEDGE_CATEGORIES = [
  'Allgemein',
  'Produkte',
  'Business Rules',
  'Onboarding',
  'Live Coaching',
  'Compliance',
] as const;
