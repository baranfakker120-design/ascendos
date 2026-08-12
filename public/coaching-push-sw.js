/**
 * Imported into the generated Workbox service worker via vite-plugin-pwa
 * workbox.importScripts. Handles Web Push + notification click for Live Coaching.
 */
/* eslint-disable no-undef -- service worker global scope */
/* global self, clients */

self.addEventListener('push', (event) => {
  let data = {
    title: '🔴 LIVE COACHING',
    body: '',
    eventId: '',
    startAt: '',
    zoomUrl: null,
    kind: '',
    url: '/',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data ? event.data.text() : '';
      if (text) data.body = text;
    } catch {
      // ignore
    }
  }

  const title = data.title || '🔴 LIVE COACHING';
  const tag = data.eventId && data.kind ? `coaching-${data.eventId}-${data.kind}` : 'coaching-push';

  const options = {
    body: data.body || '',
    tag,
    renotify: true,
    data: {
      url: data.url || '/',
      eventId: data.eventId || null,
      zoomUrl: data.zoomUrl || null,
      startAt: data.startAt || null,
      kind: data.kind || null,
    },
    // Actions are best-effort; iOS may ignore them — notification still shows.
    actions: data.zoomUrl
      ? [{ action: 'open', title: 'ZOOM BEITRETEN' }]
      : [{ action: 'open', title: 'Öffnen' }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const targetUrl = typeof payload.url === 'string' && payload.url ? payload.url : '/';

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigate failures
            }
          }
          return;
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
