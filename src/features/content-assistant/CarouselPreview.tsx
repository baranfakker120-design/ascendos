import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { createSignedAssetUrl, type ContentAsset } from './contentAssetsApi';

/**
 * Social-style carousel preview — swipe/nav + slide counter + thumbnails.
 */
export function CarouselPreview({ assets }: { assets: ContentAsset[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const touchX = useRef<number | null>(null);

  const safeIndex = Math.min(index, Math.max(0, assets.length - 1));
  const current = assets[safeIndex] ?? null;

  useEffect(() => {
    setIndex(0);
  }, [assets.map((a) => a.id).join(',')]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      assets.map(async (asset) => {
        try {
          const url = await createSignedAssetUrl(asset.storage_path, 1800);
          return [asset.id, url] as const;
        } catch {
          return [asset.id, ''] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) {
        if (url) next[id] = url;
      }
      setUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [assets.map((a) => a.id).join(',')]);

  const label = useMemo(() => `${safeIndex + 1} / ${assets.length}`, [safeIndex, assets.length]);

  if (assets.length < 2) return null;

  const go = (next: number) => {
    setIndex(Math.min(assets.length - 1, Math.max(0, next)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('contentAssistant.carouselPreviewTitle')}
        </p>
        <p className="text-xs font-semibold tabular-nums text-ink">{label}</p>
      </div>

      <div
        className="relative overflow-hidden rounded-[1.35rem] border border-line bg-[rgb(var(--color-surface))]"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) < 40) return;
          go(safeIndex + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="aspect-[4/5] w-full">
          {current && urls[current.id] ? (
            <img
              src={urls[current.id]}
              alt={current.title || current.file_name}
              className="h-full w-full object-cover transition-opacity duration-300"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {t('contentAssistant.igPreviewMediaLoading')}
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
          <div className="flex gap-1">
            {assets.map((_, i) => (
              <span
                key={`dot-${i}`}
                className={`h-1 rounded-full transition-all ${
                  i === safeIndex ? 'w-4 bg-white/90' : 'w-1.5 bg-white/45'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-y-0 left-0 flex items-center pl-1">
          <Button
            type="button"
            size="chip"
            variant="secondary"
            fullWidth={false}
            disabled={safeIndex === 0}
            onClick={() => go(safeIndex - 1)}
          >
            ‹
          </Button>
        </div>
        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          <Button
            type="button"
            size="chip"
            variant="secondary"
            fullWidth={false}
            disabled={safeIndex >= assets.length - 1}
            onClick={() => go(safeIndex + 1)}
          >
            ›
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {assets.map((asset, i) => (
          <button
            key={`thumb-${asset.id}`}
            type="button"
            onClick={() => go(i)}
            className={`h-12 w-12 shrink-0 overflow-hidden rounded-xl border transition ${
              i === safeIndex ? 'border-accent ring-2 ring-accent/30' : 'border-line opacity-80'
            }`}
            aria-label={`${i + 1} / ${assets.length}`}
          >
            {urls[asset.id] ? (
              <img src={urls[asset.id]} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="block h-full w-full bg-line/40" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
