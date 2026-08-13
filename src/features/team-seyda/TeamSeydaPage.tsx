import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';

/**
 * Organization guide — iframe inside the PWA shell.
 * URL comes from active org branding / external_tools — never Org-1 hardcodes.
 */
export function OrganizationGuidePage() {
  const { t } = useI18n();
  const { profile, isPending } = useActiveOrganizationProfile();
  const [failed, setFailed] = useState(false);
  const src = profile?.guideUrl ?? null;
  const title = profile?.displayName
    ? t('orgGuide.titleNamed', { name: profile.displayName })
    : t('orgGuide.title');

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </Card>
    );
  }

  if (!src) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="mb-3 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            {t('orgGuide.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('orgGuide.guide')}</h1>
        </header>
        <Card className="space-y-2 p-6 text-center">
          <p className="font-medium">{t('orgGuide.notConfigured')}</p>
          <p className="text-sm text-muted">{t('orgGuide.notConfiguredHint')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {profile?.displayName ?? t('orgGuide.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('orgGuide.guide')}</h1>
      </header>
      <Card padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {failed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-medium">{t('orgGuide.loadError')}</p>
            <p className="text-sm text-muted">{t('orgGuide.loadHint')}</p>
            <Button
              fullWidth={false}
              variant="secondary"
              onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
            >
              {t('orgGuide.openGuide')}
            </Button>
          </div>
        ) : (
          <iframe
            title={title}
            src={src}
            className="h-full min-h-0 w-full flex-1 border-0 bg-surface"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
            onError={() => setFailed(true)}
            onLoad={(e) => {
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

/** @deprecated Use OrganizationGuidePage — kept as alias for imports during rename. */
export const TeamSeydaPage = OrganizationGuidePage;
