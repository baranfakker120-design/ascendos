import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from '@app/ErrorBoundary';
import { Providers } from '@app/providers';
import { router } from '@app/router';
import { envReady } from '@shared/config/env';
import './index.css';

/**
 * Explizite Service-Worker-Registrierung, ergaenzt am 30. Juli 2026.
 *
 * URSACHE des gemeldeten Problems, belegt: `registerType: 'autoUpdate'`
 * in vite.config.ts erzwingt zwar workbox.skipWaiting und
 * workbox.clientsClaim (vite-plugin-pwa-Dokumentation), und die
 * automatisch injizierte Registrierung (injectRegister: 'auto', hier
 * unveraendert Standard) meldet den Service Worker auch an. Das
 * garantiert aber NICHT, dass eine bereits GEOEFFNETE Seite oder eine
 * bereits INSTALLIERTE PWA die neue Version sofort uebernimmt -- ohne
 * einen expliziten registerSW()-Aufruf mit `immediate: true` kann das
 * einen zusaetzlichen vollstaendigen Neustart brauchen (in der
 * vite-plugin-pwa-eigenen Fehlersuche mehrfach dokumentiert: "sometimes
 * it takes 2 times"). Dieses Projekt hatte VORHER ueberhaupt keinen
 * registerSW()-Aufruf im Quellcode.
 *
 * `immediate: true` registriert sofort beim Laden, ohne auf eine
 * Nutzerinteraktion zu warten -- passend zu `registerType: 'autoUpdate'`,
 * das ohnehin keine Bestaetigung durch den Nutzer vorsieht.
 */
registerSW({ immediate: true });

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
