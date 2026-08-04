import { useEffect, type ReactNode } from 'react';
import { ensureNetworkListeners, isOnline, subscribeNetwork } from './networkStatus';
import { registerOfflineHandlers } from './registerHandlers';
import { flushSyncQueue } from './syncQueue';
import { flushUploadQueue } from './uploadQueue';

let handlersReady = false;
let bootstrapCount = 0;

async function flushAll(): Promise<void> {
  if (!isOnline()) return;
  await flushSyncQueue();
  await flushUploadQueue();
}

/**
 * Boots offline listeners + outbox flush once per app lifetime.
 * Mount inside Providers (not in leaf UI).
 */
export function OfflineBootstrap({ children }: { children?: ReactNode }) {
  useEffect(() => {
    if (!handlersReady) {
      registerOfflineHandlers();
      handlersReady = true;
    }
    ensureNetworkListeners();
    bootstrapCount += 1;

    const run = () => {
      void flushAll();
    };

    run();
    const unsub = subscribeNetwork((online) => {
      if (online) run();
    });
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', run);
    const interval = window.setInterval(() => {
      if (isOnline()) run();
    }, 30_000);

    return () => {
      bootstrapCount -= 1;
      // Keep listeners if another bootstrap still mounted (StrictMode safe-ish).
      if (bootstrapCount > 0) return;
      unsub();
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', run);
      window.clearInterval(interval);
    };
  }, []);

  return <>{children}</>;
}
