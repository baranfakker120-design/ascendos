import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@app/ErrorBoundary';
import { Providers } from '@app/providers';
import { router } from '@app/router';
import { envReady } from '@shared/config/env';
import './index.css';

function ConfigMissing() {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: 24, textAlign: 'center', fontFamily: 'system-ui',
      }}
    >
      <p style={{ fontSize: 18, fontWeight: 700 }}>AscendOS ist noch nicht konfiguriert.</p>
      <p style={{ maxWidth: 420, color: '#6E7075' }}>
        Die Umgebungsvariablen VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen.
        In Netlify unter Site settings → Environment variables setzen und neu deployen.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {envReady ? (
      <ErrorBoundary>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </ErrorBoundary>
    ) : (
      <ConfigMissing />
    )}
  </StrictMode>
);
