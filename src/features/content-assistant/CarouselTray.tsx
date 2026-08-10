import { useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { ContentAssetThumb } from './ContentAssetThumb';
import type { ContentAsset } from './contentAssetsApi';
import { CAROUSEL_MAX_SLIDES, reorderSelection, selectionCounter } from './lib/carousel/selection';

/**
 * Selected slides tray — drag reorder (mouse + touch), remove, replace.
 * Order is the Instagram carousel publish order.
 */
export function CarouselTray({
  assets,
  onReorder,
  onRemove,
  onReplace,
}: {
  assets: ContentAsset[];
  onReorder: (nextIds: string[]) => void;
  onRemove: (assetId: string) => void;
  onReplace: (index: number) => void;
}) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const touchStart = useRef<{ index: number; y: number } | null>(null);

  if (assets.length === 0) return null;

  const applyReorder = (from: number, to: number) => {
    if (from === to) return;
    onReorder(
      reorderSelection(
        assets.map((a) => a.id),
        from,
        to
      )
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('contentAssistant.carouselSelectionTitle')}
        </p>
        <p className="text-xs font-semibold tabular-nums text-ink">
          {selectionCounter(assets.length)}
        </p>
      </div>
      <p className="text-xs text-muted">{t('contentAssistant.carouselSelectionHint')}</p>

      <ul
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label={t('contentAssistant.carouselSelectionTitle')}
      >
        {assets.map((asset, index) => {
          const active = dragIndex === index;
          const over = overIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={asset.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                if (dragIndex != null && overIndex != null) applyReorder(dragIndex, overIndex);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(index);
              }}
              onTouchStart={(e) => {
                touchStart.current = { index, y: e.touches[0]?.clientY ?? 0 };
              }}
              onTouchMove={(e) => {
                if (!touchStart.current) return;
                const y = e.touches[0]?.clientY ?? 0;
                const delta = y - touchStart.current.y;
                if (Math.abs(delta) < 28) return;
                const dir = delta > 0 ? 1 : -1;
                const to = Math.min(assets.length - 1, Math.max(0, touchStart.current.index + dir));
                if (to !== touchStart.current.index) {
                  applyReorder(touchStart.current.index, to);
                  touchStart.current = { index: to, y };
                }
              }}
              onTouchEnd={() => {
                touchStart.current = null;
              }}
              className={`relative w-[5.5rem] shrink-0 rounded-2xl border px-1.5 py-1.5 transition ${
                active
                  ? 'scale-[1.03] border-accent bg-accent/10 shadow-md'
                  : over
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-line bg-[rgb(var(--color-bg))]/70'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-[0.65rem] font-semibold tabular-nums text-muted">
                  {index + 1}/{CAROUSEL_MAX_SLIDES}
                </span>
                <ContentAssetThumb asset={asset} />
                <p className="line-clamp-1 w-full text-center text-[0.65rem] text-muted">
                  {asset.title || asset.file_name}
                </p>
                <div className="flex w-full gap-1">
                  <Button
                    type="button"
                    size="chip"
                    variant="ghost"
                    fullWidth={false}
                    className="flex-1 !px-1 !text-[0.65rem]"
                    onClick={() => onReplace(index)}
                  >
                    {t('contentAssistant.carouselReplace')}
                  </Button>
                  <Button
                    type="button"
                    size="chip"
                    variant="ghost"
                    fullWidth={false}
                    className="flex-1 !px-1 !text-[0.65rem]"
                    onClick={() => onRemove(asset.id)}
                  >
                    {t('contentAssistant.carouselRemove')}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {assets.length >= CAROUSEL_MAX_SLIDES ? (
        <p className="text-xs font-medium text-muted">{t('contentAssistant.carouselMaxReached')}</p>
      ) : null}
    </div>
  );
}
