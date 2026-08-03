import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { RankFrame } from '@shared/ui/RankFrame';
import { Button } from '@shared/ui/Button';
import { cropCircleWebp, type CircleCropTransform } from './cropImage';
import './avatar-crop.css';

/** Cover = Kreis gefüllt; Start leicht enger, Zoom weit hinein. */
export const CROP_INITIAL_ZOOM = 1.15;
export const CROP_MAX_ZOOM_FACTOR = 6;
export const CROP_OUTPUT_SIZE = 512;
export const CROP_CIRCLE_PX = 280;

export interface AvatarCropModalProps {
  file: File;
  /** Aktiver Rahmen für Live-Vorschau. */
  frameKey?: string | null;
  name: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}

function containSize(imgW: number, imgH: number, box: number) {
  const ratio = imgW / imgH;
  if (ratio > 1) return { baseWidth: box, baseHeight: box / ratio };
  return { baseWidth: box * ratio, baseHeight: box };
}

export function coverScaleForImage(imgW: number, imgH: number, circle: number): number {
  const contained = containSize(imgW, imgH, circle);
  return Math.max(circle / contained.baseWidth, circle / contained.baseHeight);
}

/**
 * Instagram-ähnlicher Kreiszuschnitt: Pinch/Wheel-Zoom, Pan,
 * Live-Vorschau mit aktivem Rahmen. Vorschau und Export nutzen denselben Crop.
 */
export function AvatarCropModal({
  file,
  frameKey = null,
  name,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [coverScale, setCoverScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const minScale = coverScale;
  const maxScale = coverScale * CROP_MAX_ZOOM_FACTOR;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = useMemo(() => {
    if (!natural) return { baseWidth: CROP_CIRCLE_PX, baseHeight: CROP_CIRCLE_PX };
    return containSize(natural.w, natural.h, CROP_CIRCLE_PX);
  }, [natural]);

  const clampOffset = useCallback(
    (x: number, y: number, nextScale: number) => {
      const drawnW = base.baseWidth * nextScale;
      const drawnH = base.baseHeight * nextScale;
      const maxX = Math.max(0, (drawnW - CROP_CIRCLE_PX) / 2);
      const maxY = Math.max(0, (drawnH - CROP_CIRCLE_PX) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [base.baseWidth, base.baseHeight]
  );

  const setScaleClamped = useCallback(
    (next: number) => {
      const s = Math.min(maxScale, Math.max(minScale, next));
      setScale(s);
      setOffset((o) => clampOffset(o.x, o.y, s));
    },
    [clampOffset, minScale, maxScale]
  );

  const currentTransform = useMemo((): CircleCropTransform | null => {
    if (!natural) return null;
    return {
      baseWidth: base.baseWidth,
      baseHeight: base.baseHeight,
      scale,
      offsetX: offset.x,
      offsetY: offset.y,
      circleDiameter: CROP_CIRCLE_PX,
    };
  }, [natural, base.baseWidth, base.baseHeight, scale, offset.x, offset.y]);

  // Live-Vorschau: identischer Crop wie beim Speichern (gleiche OUTPUT_SIZE).
  useEffect(() => {
    if (!currentTransform) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const blob = await cropCircleWebp(file, currentTransform, CROP_OUTPUT_SIZE);
        if (cancelled) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewSrc(url);
      } catch {
        /* preview optional */
      }
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [file, currentTransform]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    []
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStart.current = { dist, scale };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / Math.max(1, pinchStart.current.dist);
      setScaleClamped(pinchStart.current.scale * ratio);
      return;
    }

    if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset(clampOffset(dragStart.current.ox + dx, dragStart.current.oy + dy, scale));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) dragStart.current = null;
    if (pointers.current.size === 1) {
      const pt = [...pointers.current.values()][0];
      dragStart.current = { x: pt.x, y: pt.y, ox: offset.x, oy: offset.y };
    }
  };

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    setScaleClamped(scale * (1 - e.deltaY * 0.0015));
  };

  const confirm = async () => {
    if (!currentTransform) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await cropCircleWebp(file, currentTransform, CROP_OUTPUT_SIZE);
      await onConfirm(blob);
    } catch {
      setError('Zuschneiden fehlgeschlagen. Bitte erneut versuchen.');
      setBusy(false);
    }
  };

  const drawnW = base.baseWidth * scale;
  const drawnH = base.baseHeight * scale;

  return (
    <div className="avatar-crop-root" role="dialog" aria-modal="true" aria-label="Profilbild zuschneiden">
      <header className="avatar-crop-header">
        <button type="button" className="avatar-crop-icon-btn" onClick={onCancel} aria-label="Abbrechen">
          ✕
        </button>
        <h2 className="avatar-crop-title">Profilbild</h2>
        <button
          type="button"
          className="avatar-crop-check"
          onClick={() => void confirm()}
          disabled={busy || !natural}
          aria-label="Übernehmen"
        >
          ✓
        </button>
      </header>

      <div
        className="avatar-crop-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="avatar-crop-circle" style={{ width: CROP_CIRCLE_PX, height: CROP_CIRCLE_PX }}>
          {objectUrl ? (
            <img
              src={objectUrl}
              alt=""
              draggable={false}
              className="avatar-crop-image"
              style={{
                width: drawnW,
                height: drawnH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const cover = coverScaleForImage(w, h, CROP_CIRCLE_PX);
                const initial = cover * CROP_INITIAL_ZOOM;
                setNatural({ w, h });
                setCoverScale(cover);
                setScale(Math.min(cover * CROP_MAX_ZOOM_FACTOR, initial));
                setOffset({ x: 0, y: 0 });
              }}
            />
          ) : null}
          <div className="avatar-crop-veil" aria-hidden />
        </div>
        <p className="avatar-crop-hint">Zum Zoomen kneifen oder scrollen · Zum Verschieben ziehen</p>
      </div>

      <div className="avatar-crop-preview">
        <p className="avatar-crop-preview-label">Vorschau mit Rahmen</p>
        <div className="avatar-crop-preview-frame">
          <RankFrame frameKey={frameKey} src={previewSrc} name={name} size="lg" />
        </div>
      </div>

      {error ? <p className="avatar-crop-error">{error}</p> : null}

      <div className="avatar-crop-actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button type="button" onClick={() => void confirm()} disabled={busy || !natural}>
          {busy ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </div>
    </div>
  );
}
