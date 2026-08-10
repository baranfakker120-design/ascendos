import { useI18n } from '@shared/i18n';
import type { ContentAnalysisJson, ContentDraft } from './contentDraftsApi';

/** Structured Content Assistant result — analysis, keywords/hashtags with reasons, slides. */
export function ContentResultPanel({
  draft,
  analysis,
}: {
  draft: ContentDraft;
  analysis: ContentAnalysisJson | null;
}) {
  const { t } = useI18n();
  const data = analysis ?? draft.analysis_json ?? {};
  const keywordDetails =
    data.keyword_details ??
    (draft.keywords ?? []).map((keyword) => ({
      keyword,
      why: t('contentAssistant.keywordReasonFallback'),
    }));
  const hashtagDetails =
    data.hashtag_details ??
    (draft.hashtags ?? []).slice(0, 5).map((tag) => ({
      tag,
      why: t('contentAssistant.hashtagReasonFallback'),
    }));
  const slides = data.slides ?? [];

  return (
    <div className="space-y-3 rounded-2xl border border-line px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {t('contentAssistant.analysisTitle')}
      </p>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted">{t('contentAssistant.analysisTheme')}</dt>
          <dd className="text-ink">{data.theme || draft.target_audience || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">
            {t('contentAssistant.analysisAudience')}
          </dt>
          <dd className="text-ink">
            {draft.target_audience || data.audience_hint || data.target_audience || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted">
            {t('contentAssistant.analysisCoreMessage')}
          </dt>
          <dd className="text-ink">{data.core_message || data.message || '—'}</dd>
        </div>
        {data.content_intent ? (
          <div>
            <dt className="text-xs font-semibold text-muted">
              {t('contentAssistant.analysisIntent')}
            </dt>
            <dd className="text-ink">{data.content_intent}</dd>
          </div>
        ) : null}
        {data.why_save || data.why_share || data.why_swipe ? (
          <div className="space-y-1 text-xs text-muted">
            {data.why_swipe ? (
              <p>
                <span className="font-semibold text-ink">{t('contentAssistant.analysisWhySwipe')}: </span>
                {data.why_swipe}
              </p>
            ) : null}
            {data.why_save ? (
              <p>
                <span className="font-semibold text-ink">{t('contentAssistant.analysisWhySave')}: </span>
                {data.why_save}
              </p>
            ) : null}
            {data.why_share ? (
              <p>
                <span className="font-semibold text-ink">{t('contentAssistant.analysisWhyShare')}: </span>
                {data.why_share}
              </p>
            ) : null}
          </div>
        ) : null}
      </dl>

      {data.hook_strength === 'weak' && (data.hook_alternatives?.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-line px-2.5 py-2">
          <p className="text-xs font-semibold text-ink">{t('contentAssistant.hookWeakTitle')}</p>
          <ul className="mt-1 space-y-1">
            {data.hook_alternatives!.slice(0, 3).map((h) => (
              <li key={h} className="text-xs text-muted">
                {h}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {t('contentAssistant.keywordsTitle')}
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {keywordDetails.slice(0, 8).map((k) => (
            <li key={k.keyword} className="text-xs text-ink">
              <span className="font-semibold">{k.keyword}</span>
              <span className="text-muted"> — {t('contentAssistant.reasonPrefix')} {k.why}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
          {t('contentAssistant.hashtagsExactTitle')}
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {hashtagDetails.slice(0, 5).map((h, i) => (
            <li key={`${h.tag}-${i}`} className="text-xs text-ink">
              <span className="font-semibold">#{h.tag.replace(/^#/, '')}</span>
              <span className="text-muted"> — {t('contentAssistant.reasonPrefix')} {h.why}</span>
            </li>
          ))}
        </ul>
      </div>

      {slides.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t('contentAssistant.carouselAnalysisTitle')}
          </p>
          <ul className="mt-1.5 space-y-2">
            {slides.map((s) => (
              <li key={`slide-${s.index}`} className="text-xs text-ink">
                <p className="font-semibold">
                  {t('contentAssistant.carouselSlideLabel', { n: String(s.index) })}
                  {s.role ? ` · ${s.role}` : ''}
                </p>
                <p className="text-muted">{s.summary}</p>
                {s.issue ? (
                  <p className="mt-0.5 text-muted">
                    {t('contentAssistant.carouselSlideIssue')}: {s.issue}
                    {s.fix ? ` → ${s.fix}` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.optimization ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            {t('contentAssistant.optimizationTitle')}
          </p>
          <p className="mt-1 text-xs text-ink whitespace-pre-wrap">{data.optimization}</p>
        </div>
      ) : null}
    </div>
  );
}
