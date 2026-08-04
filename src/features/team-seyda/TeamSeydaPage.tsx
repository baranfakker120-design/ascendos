import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';

/**
 * Team Seyda Guide — opened inside the PWA shell (iframe), never the
 * system browser. Bottom nav stays available around this view.
 */
export function TeamSeydaPage() {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const src = 'https://teamseydaguide.netlify.app';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('teamSeyda.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('teamSeyda.guide')}</h1>
      </header>
      <Card padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {failed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-medium">{t('teamSeyda.loadError')}</p>
            <p className="text-sm text-muted">{t('teamSeyda.loadHint')}</p>
            <Button
              fullWidth={false}
              variant="secondary"
              onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
            >
              {t('teamSeyda.openGuide')}
            </Button>
          </div>
        ) : (
          <iframe
            title={t('teamSeyda.title')}
            src={src}
            className="h-full min-h-0 w-full flex-1 border-0 bg-surface"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
            onError={() => setFailed(true)}
            onLoad={(e) => {
              // Blank iframe documents (X-Frame denial) often have no contentWindow access.
              try {
                const doc = e.currentTarget.contentDocument;
                if (doc && doc.location.href === 'about:blank') setFailed(true);
              } catch {
                // Cross-origin success — leave as-is.
              }
            }}
          />
        )}
      </Card>
    </div>
  );
}
