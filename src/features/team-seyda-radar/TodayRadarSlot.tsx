import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Button, buttonClassName } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { resolveRadarUiOrgId } from './teamSeydaRadar';
import { sanitizeRadarCanonicalUrl } from './radarInsertGate';
import { useRadarItems, useResolveRadarItem } from './radarItemsApi';
import type { TeamRadarItem } from './radarItemsMap';
import { radarBerlinDate, radarBerlinTime, radarWhenKind } from './radarWhen';
import './radar.css';

/**
 * Additive Today slot — Org #1 only.
 * Lists unresolved Business Discovery hits (feed/reel permalinks).
 * No media download / no scrape / no unofficial Instagram APIs.
 */
export function TodayRadarSlot() {
  const { t, locale } = useI18n();
  const { membership, profile } = useAuth();
  const orgId = resolveRadarUiOrgId(membership?.org_id, profile?.org_id);
  const visible = Boolean(orgId);
  const { data: items = [], isPending, isError, refetch } = useRadarItems();
  const resolve = useResolveRadarItem();

  if (!visible) return null;

  return (
    <section
      id="heute-radar"
      className="radar-slot scroll-mt-4 space-y-2"
      aria-label={t('radar.slotTitle')}
    >
      <p className="exec-mission__label">{t('radar.slotTitle')}</p>
      <Card padding="sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[1.02rem] font-bold tracking-tight text-ink">
              {t('radar.slotTitle')}
            </h2>
            <p className="mt-0.5 text-[0.78rem] text-muted">{t('radar.subtitle')}</p>
          </div>
          {items.length > 0 ? (
            <span className="radar-slot__count shrink-0">
              {t('radar.count', { n: items.length })}
            </span>
          ) : null}
        </div>

        {isPending ? <p className="mt-3 text-sm text-muted">{t('common.loading')}</p> : null}

        {isError ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted">{t('radar.loadError')}</p>
            <Button variant="secondary" size="sm" fullWidth={false} onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}

        {!isPending && !isError && items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('radar.empty')}</p>
        ) : null}

        {items.length > 0 ? (
          <ul className="mt-3 divide-y divide-[rgb(var(--color-line))]">
            {items.map((item) => (
              <RadarHitRow
                key={item.id}
                item={item}
                locale={locale}
                busy={resolve.isPending && resolve.variables === item.id}
                onSeen={() => void resolve.mutateAsync(item.id)}
              />
            ))}
          </ul>
        ) : null}

        <p className="mt-3 text-[0.72rem] leading-snug text-muted">{t('radar.storiesHint')}</p>
      </Card>
    </section>
  );
}

function RadarHitRow({
  item,
  locale,
  busy,
  onSeen,
}: {
  item: TeamRadarItem;
  locale: string;
  busy: boolean;
  onSeen: () => void;
}) {
  const { t } = useI18n();
  const href = sanitizeRadarCanonicalUrl(item.canonical_url);
  const kind = radarWhenKind(item.published_at);
  const time = radarBerlinTime(item.published_at, locale);
  const source =
    item.source === 'essence_tribe' ? t('radar.sourceEssence') : t('radar.sourceChogan');
  const type = item.content_type === 'REEL' ? t('radar.typeReel') : t('radar.typePost');
  const when =
    kind === 'today'
      ? t('radar.whenToday', { time })
      : kind === 'yesterday'
        ? t('radar.whenYesterday', { time })
        : t('radar.whenDate', { date: radarBerlinDate(item.published_at, locale), time });

  return (
    <li className="radar-slot__row py-3 first:pt-1">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-accent-deep">
        {source}
      </p>
      <p className="mt-0.5 text-[0.9rem] font-semibold text-ink">
        {type}
        <span className="font-medium text-muted"> · {when}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {href ? (
          <a
            className={buttonClassName({ variant: 'secondary', size: 'sm', fullWidth: false })}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="ui-btn__label">{t('radar.openIg')}</span>
          </a>
        ) : null}
        <Button variant="ghost" size="sm" fullWidth={false} disabled={busy} onClick={onSeen}>
          {t('radar.seen')}
        </Button>
      </div>
    </li>
  );
}
