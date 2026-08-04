import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuthProvider } from '@shared/auth/AuthProvider';
import { LocaleProvider } from '@shared/i18n';
import { OfflineBootstrap, createIdbQueryPersister, shouldPersistQuery } from '@shared/offline';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Keep cached data usable while offline after a restore.
      gcTime: 1000 * 60 * 60 * 24 * 7,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 0,
    },
  },
});

const persister = createIdbQueryPersister();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 14,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== 'success') return false;
            return shouldPersistQuery(query.queryKey);
          },
        },
      }}
    >
      <LocaleProvider>
        <OfflineBootstrap>
          <AuthProvider>{children}</AuthProvider>
        </OfflineBootstrap>
      </LocaleProvider>
    </PersistQueryClientProvider>
  );
}
