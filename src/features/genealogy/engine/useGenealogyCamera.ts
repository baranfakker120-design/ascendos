import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SCALE, MIN_SCALE, type CameraState } from '../types';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Camera driven by refs during gestures (no React re-render per frame).
 * Subscribers get rAF updates; React state syncs after gesture end / zoom settle.
 */
export function useGenealogyCamera(initial?: Partial<CameraState>) {
  const cameraRef = useRef<CameraState>({
    x: initial?.x ?? 0,
    y: initial?.y ?? 0,
    scale: initial?.scale ?? 0.85,
  });
  const [camera, setCamera] = useState<CameraState>(cameraRef.current);
  const listeners = useRef(new Set<(c: CameraState) => void>());

  const emit = useCallback(() => {
    const snap = { ...cameraRef.current };
    for (const fn of listeners.current) fn(snap);
  }, []);

  const subscribe = useCallback((fn: (c: CameraState) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const commit = useCallback(() => {
    setCamera({ ...cameraRef.current });
    emit();
  }, [emit]);

  const setCameraImmediate = useCallback(
    (next: CameraState) => {
      cameraRef.current = {
        x: next.x,
        y: next.y,
        scale: clamp(next.scale, MIN_SCALE, MAX_SCALE),
      };
      emit();
    },
    [emit]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      emit();
    },
    [emit]
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number, origin: DOMRect) => {
      const prev = cameraRef.current;
      const nextScale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (clientX - origin.left - prev.x) / prev.scale;
      const wy = (clientY - origin.top - prev.y) / prev.scale;
      cameraRef.current = {
        scale: nextScale,
        x: clientX - origin.left - wx * nextScale,
        y: clientY - origin.top - wy * nextScale,
      };
      emit();
    },
    [emit]
  );

  const focusOn = useCallback(
    (worldX: number, worldY: number, viewportW: number, viewportH: number, scale?: number) => {
      const s = clamp(scale ?? cameraRef.current.scale, MIN_SCALE, MAX_SCALE);
      cameraRef.current = {
        scale: s,
        x: viewportW / 2 - worldX * s,
        y: viewportH / 2 - worldY * s,
      };
      commit();
    },
    [commit]
  );

  useEffect(() => {
    commit();
  }, [commit]);

  return {
    camera,
    cameraRef,
    subscribe,
    commit,
    setCameraImmediate,
    panBy,
    zoomAt,
    focusOn,
  };
}
