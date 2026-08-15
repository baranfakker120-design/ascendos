import { useI18n } from '@shared/i18n';
import { useMemo, useState, type ClipboardEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@shared/auth/AuthProvider';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { Select } from '@shared/ui/Select';
import { TextArea } from '@shared/ui/TextArea';
import { extractText } from '@features/knowledge/extractText';
import { asFlagsDisplay } from './flagDisplay';
import {
  useKnowledgeArticles,
  useKnowledgeChangeLog,
  useKnowledgeMutations,
  useKnowledgeVersions,
} from './knowledgeCenterApi';
import { KNOWLEDGE_CATEGORIES, type CoachKnowledgeArticle } from './types';

export function KnowledgeCenterPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: articles = [], isPending, isError } = useKnowledgeArticles(search);
  const { saveArticle, deactivate } = useKnowledgeMutations();
  const versions = useKnowledgeVersions(selectedId);
  const changelog = useKnowledgeChangeLog(selectedId);

  const selected = useMemo(
    () => articles.find((a) => a.id === selectedId) ?? null,
    [articles, selectedId]
  );

  const {
    value: { title, body, category, tags, changeSummary },
    setValue: setEditor,
    patch,
    clear: clearEditorDraft,
  } = usePersistedDraft(DRAFT_SCOPES.knowledgeCenter, {
    title: '',
    body: '',
    category: KNOWLEDGE_CATEGORIES[0] as string,
    tags: '',
    changeSummary: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadArticle = (article: CoachKnowledgeArticle | null) => {
    setSelectedId(article?.id ?? null);
    setEditor({
      title: article?.title ?? '',
      body: article?.body_markdown ?? '',
      category: article?.category ?? KNOWLEDGE_CATEGORIES[0],
      tags: (article?.tags ?? []).join(', '),
      changeSummary: '',
    });
    setMessage(null);
    setError(null);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    // Allow native paste; also accept HTML→text via browser.
    const html = e.clipboardData.getData('text/html');
    if (html && !e.clipboardData.getData('text/plain')) {
      e.preventDefault();
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const next = tmp.innerText;
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      patch({ body: body.slice(0, start) + next + body.slice(end) });
    }
  };

  const onPdfImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { text } = await extractText(file);
      setEditor((prev) => ({
        ...prev,
        body: prev.body ? `${prev.body.trim()}\n\n${text}` : text,
        title: prev.title || file.name.replace(/\.[^.]+$/, ''),
      }));
      setMessage(t('knowledge.importOk'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledge.importFailed'));
    }
  };

  const persist = async (intendApprove: boolean) => {
    setError(null);
    setMessage(null);
    try {
      const result = await saveArticle.mutateAsync({
        id: selectedId ?? undefined,
        title,
        bodyMarkdown: body,
        category,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        intendApprove,
        changeSummary: changeSummary || undefined,
        actorId: profile?.id ?? null,
      });
      setSelectedId(result.article.id);
      await clearEditorDraft();
      if (result.article.status === 'needs_review') {
        setMessage(t('knowledge.needsReviewConflict'));
      } else if (result.article.active) {
        setMessage(t('knowledge.approvedHint'));
      } else {
        setMessage(t('knowledge.draftSaved'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledge.saveFailed'));
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('coach.name')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('knowledge.centerTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('knowledge.centerBody')}</p>
      </header>

      <Alert tone="info">{`${t('knowledge.cmsLabel')} — ${t('knowledge.cmsVsRag')}`}</Alert>

      <Input
        label={t('knowledge.search')}
        hideLabel
        placeholder={t('knowledge.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isPending ? <p className="text-sm text-muted">{t('common.loading')}</p> : null}
      {isError ? <Alert tone="error">{t('knowledge.loadFailed')}</Alert> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{t('knowledge.articles')}</p>
            <Button
              size="sm"
              fullWidth={false}
              variant="secondary"
              onClick={() => loadArticle(null)}
            >
              {t('knowledge.new')}
            </Button>
          </div>
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
            {articles.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => loadArticle(a)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    selectedId === a.id ? 'border-accent bg-bg' : 'border-line hover:bg-bg'
                  }`}
                >
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {a.category} · {a.status}
                    {a.active ? ` · ${t('knowledge.active')}` : ''}
                    {a.status === 'needs_review' ? ` · ${t('knowledge.statusNeedsReview')}` : ''}
                  </p>
                </button>
              </li>
            ))}
            {articles.length === 0 && !isPending ? (
              <li className="text-sm text-muted">{t('knowledge.emptyArticles')}</li>
            ) : null}
          </ul>
        </Card>

        <Card className="space-y-3">
          <Input
            label={t('knowledge.titleLabel')}
            value={title}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <Select
            label={t('knowledge.category')}
            value={category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label={t('knowledge.tags')}
            hint={t('knowledge.tagsHint')}
            value={tags}
            onChange={(e) => patch({ tags: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
              {t('knowledge.upload')}
              <input
                type="file"
                accept=".pdf,.md,.txt,.docx"
                className="hidden"
                onChange={onPdfImport}
              />
            </label>
          </div>
          <TextArea
            label={t('knowledge.contentLabel')}
            value={body}
            onChange={(e) => patch({ body: e.target.value })}
            onPaste={onPaste}
            rows={12}
          />
          <Input
            label={t('knowledge.changeNote')}
            value={changeSummary}
            onChange={(e) => patch({ changeSummary: e.target.value })}
          />

          {selected ? (
            <div className="rounded-xl border border-line bg-bg px-3 py-2 text-sm">
              <p className="font-medium">{selected.status}</p>
              {asFlagsDisplay(selected.contradiction_flags).length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
                  {asFlagsDisplay(selected.contradiction_flags).map((f) => (
                    <li key={`${f.kind}-${f.message}`}>
                      [{f.kind}] {f.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">{t('knowledge.noContradictions')}</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              fullWidth={false}
              variant="secondary"
              disabled={saveArticle.isPending}
              onClick={() => void persist(false)}
            >
              {t('knowledge.saveDraft')}
            </Button>
            <Button
              fullWidth={false}
              disabled={saveArticle.isPending}
              onClick={() => void persist(true)}
            >
              {t('knowledge.reviewApprove')}
            </Button>
            {selectedId ? (
              <Button
                fullWidth={false}
                variant="ghost"
                disabled={deactivate.isPending}
                onClick={() => void deactivate.mutateAsync(selectedId)}
              >
                {t('knowledge.archive')}
              </Button>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-semibold">{t('knowledge.preview')}</p>
            <div className="prose prose-sm mt-2 max-w-none rounded-xl border border-line bg-surface px-3 py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {body || t('knowledge.emptyBody')}
              </ReactMarkdown>
            </div>
          </div>

          {selectedId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">{t('knowledge.versionHistory')}</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                  {(versions.data ?? []).map((v) => (
                    <li key={v.id}>
                      v{v.version} · {v.status} · {new Date(v.created_at).toLocaleString()}
                      {v.change_summary ? ` — ${v.change_summary}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold">{t('knowledge.changeHistory')}</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                  {(changelog.data ?? []).map((c) => (
                    <li key={c.id}>
                      {c.action} · {new Date(c.created_at).toLocaleString()}
                      {c.detail ? ` — ${c.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
