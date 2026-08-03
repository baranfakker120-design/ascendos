import { useMemo, useState, type ClipboardEvent, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@shared/auth/AuthProvider';
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

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>(KNOWLEDGE_CATEGORIES[0]);
  const [tags, setTags] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadArticle = (article: CoachKnowledgeArticle | null) => {
    setSelectedId(article?.id ?? null);
    setTitle(article?.title ?? '');
    setBody(article?.body_markdown ?? '');
    setCategory(article?.category ?? KNOWLEDGE_CATEGORIES[0]);
    setTags((article?.tags ?? []).join(', '));
    setChangeSummary('');
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
      setBody(body.slice(0, start) + next + body.slice(end));
    }
  };

  const onPdfImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { text } = await extractText(file);
      setBody((prev) => (prev ? `${prev.trim()}\n\n${text}` : text));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      setMessage('PDF / Dokument importiert — bitte prüfen und speichern.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
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
          .map((t) => t.trim())
          .filter(Boolean),
        intendApprove,
        changeSummary: changeSummary || undefined,
        actorId: profile?.id ?? null,
      });
      setSelectedId(result.article.id);
      if (result.article.status === 'needs_review') {
        setMessage('Needs Review — Widersprüche gefunden. Aktivierung blockiert.');
      } else if (result.article.active) {
        setMessage('Freigegeben — Coach lernt aus diesem Wissen.');
      } else {
        setMessage('Entwurf gespeichert.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Coach</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Knowledge Center</h1>
        <p className="mt-1 text-sm text-muted">
          Rich Text, Markdown, PDF, Versionen und Widerspruchsprüfung. Nur SuperAdmin & Developer.
        </p>
      </header>

      <Input
        label="Suche"
        hideLabel
        placeholder="Suche in Titel, Inhalt, Tags …"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isPending ? <p className="text-sm text-muted">Wissen wird geladen …</p> : null}
      {isError ? <Alert tone="error">Knowledge Center konnte nicht geladen werden.</Alert> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Artikel</p>
            <Button
              size="sm"
              fullWidth={false}
              variant="secondary"
              onClick={() => loadArticle(null)}
            >
              Neu
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
                    {a.active ? ' · aktiv' : ''}
                    {a.status === 'needs_review' ? ' · Needs Review' : ''}
                  </p>
                </button>
              </li>
            ))}
            {articles.length === 0 && !isPending ? (
              <li className="text-sm text-muted">Noch keine Artikel.</li>
            ) : null}
          </ul>
        </Card>

        <Card className="space-y-3">
          <Input label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select label="Kategorie" value={category} onChange={(e) => setCategory(e.target.value)}>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label="Tags"
            hint="Kommagetrennt"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
              PDF importieren
              <input
                type="file"
                accept=".pdf,.md,.txt,.docx"
                className="hidden"
                onChange={onPdfImport}
              />
            </label>
          </div>
          <TextArea
            label="Inhalt (Markdown / Rich Text)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPaste}
            rows={12}
          />
          <Input
            label="Änderungsnotiz"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
          />

          {selected ? (
            <div className="rounded-xl border border-line bg-bg px-3 py-2 text-sm">
              <p className="font-medium">Status: {selected.status}</p>
              {asFlagsDisplay(selected.contradiction_flags).length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">
                  {asFlagsDisplay(selected.contradiction_flags).map((f) => (
                    <li key={`${f.kind}-${f.message}`}>
                      [{f.kind}] {f.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted">Keine Widersprüche gemeldet.</p>
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
              Entwurf speichern
            </Button>
            <Button
              fullWidth={false}
              disabled={saveArticle.isPending}
              onClick={() => void persist(true)}
            >
              Prüfen & freigeben
            </Button>
            {selectedId ? (
              <Button
                fullWidth={false}
                variant="ghost"
                disabled={deactivate.isPending}
                onClick={() => void deactivate.mutateAsync(selectedId)}
              >
                Archivieren
              </Button>
            ) : null}
          </div>

          <div>
            <p className="text-sm font-semibold">Vorschau</p>
            <div className="prose prose-sm mt-2 max-w-none rounded-xl border border-line bg-surface px-3 py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || '_Leer_'}</ReactMarkdown>
            </div>
          </div>

          {selectedId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">Version history</p>
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
                <p className="text-sm font-semibold">Change history</p>
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
