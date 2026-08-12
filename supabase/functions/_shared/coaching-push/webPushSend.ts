/**
 * coaching-push — Web Push send helpers for Deno Edge (npm:web-push).
 * Private VAPID key stays server-side only.
 */

import webpush from 'npm:web-push@3.6.7';

export interface StoredPushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function configureVapid():
  | { ok: true }
  | { ok: false; error: 'vapid_not_configured' } {
  const subject = Deno.env.get('VAPID_SUBJECT')?.trim();
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
  if (!subject || !publicKey || !privateKey) {
    return { ok: false, error: 'vapid_not_configured' };
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { ok: true };
}

export async function sendWebPushToSubscription(
  sub: StoredPushSubscription,
  payloadJson: string
): Promise<{ ok: true } | { ok: false; statusCode?: number; gone: boolean; message: string }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      payloadJson,
      {
        TTL: 60 * 60,
        urgency: 'high',
      }
    );
    return { ok: true };
  } catch (err) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    const gone = statusCode === 404 || statusCode === 410;
    return { ok: false, statusCode, gone, message };
  }
}
