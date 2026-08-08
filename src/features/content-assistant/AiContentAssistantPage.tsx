import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';

/**
 * Navigation shell for the future AI Content Assistant.
 * No generation, Instagram API, or auto-publish — UI routes only.
 */
export function AiContentAssistantPage() {
  const { t } = useI18n();

  const formats = [
    {
      id: 'story',
      titleKey: 'todayHub.contentStory' as const,
      subKey: 'todayHub.contentStorySub' as const,
    },
    {
      id: 'feed',
      titleKey: 'todayHub.contentFeed' as const,
      subKey: 'todayHub.contentFeedSub' as const,
    },
    {
      id: 'reel',
      titleKey: 'todayHub.contentReel' as const,
      subKey: 'todayHub.contentReelSub' as const,
    },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('todayHub.contentPageEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{t('todayHub.content')}</h1>
        <p className="mt-1 text-sm text-muted">{t('todayHub.contentSub')}</p>
      </header>

      <Card>
        <p className="text-sm leading-relaxed text-ink">{t('todayHub.contentPageBody')}</p>
      </Card>

      <section className="space-y-2" aria-label={t('todayHub.contentFormatsAria')}>
        {formats.map((fmt) => (
          <Card key={fmt.id} className="flex items-center justify-between gap-3 opacity-90">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{t(fmt.titleKey)}</p>
              <p className="mt-0.5 text-sm text-muted">{t(fmt.subKey)}</p>
            </div>
            <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.68rem] font-semibold tracking-wide text-muted">
              {t('todayHub.contentComingSoon')}
            </span>
          </Card>
        ))}
      </section>

      <Card className="space-y-1">
        <p className="font-semibold text-ink">{t('todayHub.contentOpenIg')}</p>
        <p className="text-sm text-muted">{t('todayHub.contentOpenIgHint')}</p>
      </Card>

      <Link
        to="/"
        className="inline-flex text-sm font-semibold text-accent-deep underline-offset-2 hover:underline"
      >
        {t('todayHub.backToToday')}
      </Link>
    </div>
  );
}
