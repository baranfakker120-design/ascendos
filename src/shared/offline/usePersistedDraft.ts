import { useEffect, useRef, useState } from 'react';
import { clearDraft, loadDraft, saveDraft } from './draftStore';

/**
 * Autosave form/editor state to IndexedDB.
 * Restores once on mount. Debounced writes. clear() after successful submit.
 */
export function usePersistedDraft<T extends Record<string, unknown>>(
  scope: string,
  initial: T,
  options: { debounceMs?: number; enabled?: boolean } = {}
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  patch: (partial: Partial<T>) => void;
  clear: () => Promise<void>;
  hydrated: boolean;
} {
  const debounceMs = options.debounceMs ?? 350;
  const enabled = options.enabled ?? true;
  const [value, setValueState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(!enabled);
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!enabled) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const stored = await loadDraft<T>(scope);
      if (cancelled) return;
      if (stored && typeof stored === 'object') {
        setValueState({ ...initial, ...stored });
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Restore once per scope mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, enabled]);

  useEffect(() => {
    if (!enabled || !hydrated) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void saveDraft(scope, latest.current);
    }, debounceMs);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value, scope, enabled, hydrated, debounceMs]);

  const setValue = (next: T | ((prev: T) => T)) => {
    setValueState((prev) => (typeof next === 'function' ? (next as (p: T) => T)(prev) : next));
  };

  const patch = (partial: Partial<T>) => {
    setValue((prev) => ({ ...prev, ...partial }));
  };

  const clear = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await clearDraft(scope);
  };

  return { value, setValue, patch, clear, hydrated };
}
