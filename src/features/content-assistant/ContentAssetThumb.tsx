import { useEffect, useState } from 'react';
import { createSignedAssetUrl, type ContentAsset } from './contentAssetsApi';

export function ContentAssetThumb({ asset }: { asset: ContentAsset }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createSignedAssetUrl(asset.storage_path, 1800)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.storage_path]);

  if (!url) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-[rgb(var(--color-bg))] text-[0.65rem] text-muted">
        {asset.media_kind === 'video' ? 'VIDEO' : 'IMG'}
      </div>
    );
  }

  if (asset.media_kind === 'video') {
    return (
      <video
        src={url}
        className="h-16 w-16 shrink-0 rounded-xl object-cover"
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />;
}
