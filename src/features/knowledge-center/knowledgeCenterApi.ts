import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import type { Json } from '@shared/types/database.types';
import { rememberApprovedArticle } from '@features/coach/intelligence/approvedKnowledge';
import {
  detectKnowledgeContradictions,
  resolveArticleStatusAfterScan,
  summarizeContradictions,
} from './contradictionDetection';
import type {
  CoachKnowledgeArticle,
  CoachKnowledgeChangeLog,
  CoachKnowledgeVersion,
} from './types';

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .slice(0, 80);
  return `${base || 'artikel'}-${Date.now().toString(36)}`;
}

export function useKnowledgeArticles(search = '') {
  return useQuery({
    queryKey: ['coach-knowledge-articles', search],
    queryFn: async (): Promise<CoachKnowledgeArticle[]> => {
      const { data, error } = await supabase
        .from('coach_knowledge_articles')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as CoachKnowledgeArticle[];
      const needle = search.trim().toLowerCase();
      if (!needle) return rows;
      return rows.filter((r) => {
        const hay =
          `${r.title}\n${r.body_markdown}\n${r.category}\n${(r.tags ?? []).join(' ')}`.toLowerCase();
        return hay.includes(needle);
      });
    },
  });
}

/** Approved + active only — what Coach may learn from. */
export function useApprovedCoachKnowledge() {
  return useQuery({
    queryKey: ['coach-knowledge-approved'],
    queryFn: async (): Promise<CoachKnowledgeArticle[]> => {
      const { data, error } = await supabase
        .from('coach_knowledge_articles')
        .select('*')
        .eq('active', true)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoachKnowledgeArticle[];
    },
  });
}

export function useKnowledgeVersions(articleId: string | null) {
  return useQuery({
    queryKey: ['coach-knowledge-versions', articleId],
    enabled: !!articleId,
    queryFn: async (): Promise<CoachKnowledgeVersion[]> => {
      const { data, error } = await supabase
        .from('coach_knowledge_versions')
        .select('*')
        .eq('article_id', articleId!)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoachKnowledgeVersion[];
    },
  });
}

export function useKnowledgeChangeLog(articleId: string | null) {
  return useQuery({
    queryKey: ['coach-knowledge-changelog', articleId],
    enabled: !!articleId,
    queryFn: async (): Promise<CoachKnowledgeChangeLog[]> => {
      const { data, error } = await supabase
        .from('coach_knowledge_change_log')
        .select('*')
        .eq('article_id', articleId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CoachKnowledgeChangeLog[];
    },
  });
}

export interface SaveKnowledgeInput {
  id?: string;
  title: string;
  bodyMarkdown: string;
  bodyHtml?: string;
  category: string;
  tags: string[];
  /** Attempt activation / approval. Contradictions force Needs Review. */
  intendApprove?: boolean;
  changeSummary?: string;
  actorId: string | null;
}

export function useKnowledgeMutations() {
  const qc = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['coach-knowledge-articles'] }),
      qc.invalidateQueries({ queryKey: ['coach-knowledge-approved'] }),
      qc.invalidateQueries({ queryKey: ['coach-knowledge-versions'] }),
      qc.invalidateQueries({ queryKey: ['coach-knowledge-changelog'] }),
    ]);
  };

  const saveArticle = useMutation({
    mutationFn: async (input: SaveKnowledgeInput) => {
      const { data: corpus, error: corpusError } = await supabase
        .from('coach_knowledge_articles')
        .select('id, title, body_markdown, category');
      if (corpusError) throw corpusError;

      const flags = detectKnowledgeContradictions({
        title: input.title,
        bodyMarkdown: input.bodyMarkdown,
        category: input.category,
        corpus: corpus ?? [],
        excludeId: input.id,
      });
      const status = resolveArticleStatusAfterScan(
        flags,
        input.intendApprove ? 'approved' : 'draft'
      );
      const active = status === 'approved' && !!input.intendApprove;
      const summary = summarizeContradictions(flags);
      const flagsJson = flags as unknown as Json;

      if (input.id) {
        const { data: existing, error: loadErr } = await supabase
          .from('coach_knowledge_articles')
          .select('*')
          .eq('id', input.id)
          .single();
        if (loadErr) throw loadErr;
        const nextVersion = (existing.current_version ?? 1) + 1;

        const { data: updated, error } = await supabase
          .from('coach_knowledge_articles')
          .update({
            title: input.title,
            body_markdown: input.bodyMarkdown,
            body_html: input.bodyHtml ?? '',
            category: input.category,
            tags: input.tags,
            status,
            contradiction_flags: flagsJson,
            contradiction_summary: summary,
            active,
            updated_by: input.actorId,
            current_version: nextVersion,
            approved_by: active ? input.actorId : existing.approved_by,
            approved_at: active ? new Date().toISOString() : existing.approved_at,
          })
          .eq('id', input.id)
          .select('*')
          .single();
        if (error) throw error;

        const { error: verErr } = await supabase.from('coach_knowledge_versions').insert({
          article_id: input.id,
          version: nextVersion,
          title: input.title,
          body_markdown: input.bodyMarkdown,
          body_html: input.bodyHtml ?? '',
          category: input.category,
          tags: input.tags,
          status,
          change_summary: input.changeSummary ?? null,
          contradiction_flags: flagsJson,
          created_by: input.actorId,
        });
        if (verErr) throw verErr;

        const { error: logErr } = await supabase.from('coach_knowledge_change_log').insert({
          article_id: input.id,
          version: nextVersion,
          action: active ? 'approved' : status === 'needs_review' ? 'needs_review' : 'updated',
          detail: input.changeSummary ?? summary,
          actor_id: input.actorId,
        });
        if (logErr) throw logErr;

        const article = updated as CoachKnowledgeArticle;
        rememberApprovedArticle(article);
        return { article, flags };
      }

      const slug = slugify(input.title);
      const { data: created, error } = await supabase
        .from('coach_knowledge_articles')
        .insert({
          title: input.title,
          slug,
          body_markdown: input.bodyMarkdown,
          body_html: input.bodyHtml ?? '',
          category: input.category,
          tags: input.tags,
          status,
          contradiction_flags: flagsJson,
          contradiction_summary: summary,
          active,
          created_by: input.actorId,
          updated_by: input.actorId,
          current_version: 1,
          approved_by: active ? input.actorId : null,
          approved_at: active ? new Date().toISOString() : null,
        })
        .select('*')
        .single();
      if (error) throw error;

      const { error: verErr } = await supabase.from('coach_knowledge_versions').insert({
        article_id: created.id,
        version: 1,
        title: input.title,
        body_markdown: input.bodyMarkdown,
        body_html: input.bodyHtml ?? '',
        category: input.category,
        tags: input.tags,
        status,
        change_summary: input.changeSummary ?? 'Erstellt',
        contradiction_flags: flagsJson,
        created_by: input.actorId,
      });
      if (verErr) throw verErr;

      const { error: logErr } = await supabase.from('coach_knowledge_change_log').insert({
        article_id: created.id,
        version: 1,
        action: 'created',
        detail: input.changeSummary ?? summary,
        actor_id: input.actorId,
      });
      if (logErr) throw logErr;

      const article = created as CoachKnowledgeArticle;
      rememberApprovedArticle(article);
      return { article, flags };
    },
    onSuccess: () => void invalidate(),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('coach_knowledge_articles')
        .update({ active: false, status: 'archived' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  return { saveArticle, deactivate };
}
