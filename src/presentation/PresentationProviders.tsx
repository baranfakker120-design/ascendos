import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { LocaleProvider } from '@shared/i18n';
import { PresentationAuthProvider } from './PresentationAuthProvider';
import { seedPresentationData } from './seedPresentationData';

/**
 * Capture-only provider stack: offline QueryClient + presentation auth.
 * Never used in production builds unless VITE_PRESENTATION_CAPTURE=1.
 */
export function PresentationProviders({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          networkMode: 'offlineFirst',
        },
        mutations: { retry: false, networkMode: 'offlineFirst' },
      },
    });
    seedPresentationData(qc);
    return qc;
  }, []);

  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <PresentationAuthProvider>{children}</PresentationAuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
