import { useState, type ChangeEvent } from 'react';
import { useI18n } from '@shared/i18n';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { KNOWLEDGE_CATEGORIES } from './types';
import {
  useKnowledgePdfDocuments,
  useKnowledgePdfPages,
  useKnowledgePdfPipeline,
} from './knowledgePdfApi';
import type { CategoryValue } from '@features/knowledge/knowledgeApi';

const RAG_CATEGORY: CategoryValue = 'schulung';

export function KnowledgePdfPanel() {
  const { t } = useI18n();
  const { data: docs = [], isPending } = useKnowledgePdfDocuments();
  const { processPdf, approveToCms, enableCoachRag, previewSignedUrl } = useKnowledgePdfPipeline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pages = useKnowledgePdfPages(selectedId);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(KNOWLEDGE_CATEGORIES[0] as string);

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setMessage(t('knowledge.pdfStatusUploading'));
    try {
      const result = await processPdf.mutateAsync(file);
      setSelectedId(result.documentId);
      setMessage(
        t('knowledge.pdfReadyHint', {
          pages: String(result.page_count),
          text: String(result.text_page_count),
          vision: String(result.vision_page_count),
          tables: String(result.table_count),
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('knowledge.importFailed');
      setError(msg === 'VISION_FAILED' ? t('knowledge.pdfVisionFailed') : msg);
      setMessage(null);
    }
  };

  const onApproveCms = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      await approveToCms.mutateAsync({ documentId: selectedId, category });
      setMessage(t('knowledge.pdfApprovedCms'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledge.saveFailed'));
    }
  };

  const onEnableRag = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      await enableCoachRag.mutateAsync({ documentId: selectedId, category: RAG_CATEGORY });
      setMessage(t('knowledge.pdfCoachRagEnabled'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledge.saveFailed'));
    }
  };

  const onPreview = async () => {
    if (!selected?.storage_path) return;
    try {
      const url = await previewSignedUrl.mutateAsync(selected.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('knowledge.importFailed'));
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{t('knowledge.pdfPanelTitle')}</p>
          <p className="text-xs text-muted">{t('knowledge.pdfPanelHint')}</p>
        </div>
        <label className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--inline cursor-pointer">
          {processPdf.isPending ? t('knowledge.pdfProcessing') : t('knowledge.pdfUpload')}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={processPdf.isPending}
            onChange={(e) => void onUpload(e)}
          />
        </label>
      </div>

      <Alert tone="info">{t('knowledge.pdfCmsRagSeparation')}</Alert>
      {message ? <Alert tone="info">{message}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {isPending ? <p className="text-sm text-muted">{t('common.loading')}</p> : null}

      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {docs.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setSelectedId(d.id)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                selectedId === d.id ? 'border-accent bg-bg' : 'border-line hover:bg-bg'
              }`}
            >
              <p className="font-medium">{d.source_filename}</p>
              <p className="text-xs text-muted">
                {d.status} · {t('knowledge.pages', { count: String(d.page_count) })} ·{' '}
                {t('knowledge.pdfTextPages', { count: String(d.text_page_count) })} ·{' '}
                {t('knowledge.pdfVisionPages', { count: String(d.vision_page_count) })} ·{' '}
                {t('knowledge.pdfTables', { count: String(d.table_count) })}
              </p>
            </button>
          </li>
        ))}
        {docs.length === 0 && !isPending ? (
          <li className="text-sm text-muted">{t('knowledge.pdfEmpty')}</li>
        ) : null}
      </ul>

      {selected ? (
        <div className="space-y-2 rounded-xl border border-line bg-bg px-3 py-2 text-sm">
          <p className="font-medium">{selected.title || selected.source_filename}</p>
          <p className="text-xs text-muted">
            {selected.status}
            {selected.error_message ? ` — ${selected.error_message}` : ''}
          </p>
          <p className="text-xs text-muted">
            {t('knowledge.pdfImages', { count: String(selected.image_page_count) })}
            {selected.coach_rag_enabled ? ` · ${t('knowledge.pdfRagOn')}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              fullWidth={false}
              variant="secondary"
              onClick={() => void onPreview()}
              disabled={previewSignedUrl.isPending}
            >
              {t('knowledge.pdfSignedPreview')}
            </Button>
            <Button
              size="sm"
              fullWidth={false}
              disabled={
                approveToCms.isPending ||
                (selected.status !== 'ready_for_review' && selected.status !== 'vision_failed')
              }
              onClick={() => void onApproveCms()}
            >
              {t('knowledge.pdfApproveCms')}
            </Button>
            <Button
              size="sm"
              fullWidth={false}
              variant="ghost"
              disabled={
                enableCoachRag.isPending || !selected.article_id || selected.coach_rag_enabled
              }
              onClick={() => void onEnableRag()}
            >
              {t('knowledge.pdfEnableCoachRag')}
            </Button>
          </div>
          <label className="block text-xs text-muted">
            {t('knowledge.category')}
            <select
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {KNOWLEDGE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
            {(pages.data ?? []).map((p) => (
              <li key={p.id}>
                {t('knowledge.pdfPageLine', {
                  n: String(p.page_number),
                  type: p.page_type,
                  vision: p.vision_used ? t('knowledge.pdfVisionYes') : t('knowledge.pdfVisionNo'),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
