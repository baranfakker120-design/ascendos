import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SCALE, MIN_SCALE, type CameraState } from '../types';
import { clampScale, panCamera, zoomCameraAt } from './cameraMath';

/**
 * Camera driven by refs during gestures (no React re-render per frame).
 * Subscribers get updates; React state syncs after gesture end / zoom settle.
 * scale / x / y live in one persistent ref — never recreated on touch start.
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
        scale: clampScale(next.scale, MIN_SCALE, MAX_SCALE),
      };
      emit();
    },
    [emit]
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      cameraRef.current = panCamera(cameraRef.current, dx, dy);
      emit();
    },
    [emit]
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number, origin: DOMRect) => {
      const focalX = clientX - origin.left;
      const focalY = clientY - origin.top;
      cameraRef.current = zoomCameraAt(
        cameraRef.current,
        focalX,
        focalY,
        factor,
        MIN_SCALE,
        MAX_SCALE
      );
      emit();
    },
    [emit]
  );

  const focusOn = useCallback(
    (worldX: number, worldY: number, viewportW: number, viewportH: number, scale?: number) => {
      const s = clampScale(scale ?? cameraRef.current.scale, MIN_SCALE, MAX_SCALE);
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
