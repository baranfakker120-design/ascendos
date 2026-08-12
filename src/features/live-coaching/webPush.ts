/**
 * Web Push subscription for Live Coaching (iOS Home Screen PWA + browsers).
 * Uses VITE_VAPID_PUBLIC_KEY only — private key never touches the client.
 */

import { supabase } from '@shared/api/supabase';

const WEB_PUSH_FLAG_KEY = 'ascendos.webPushSubscribed';

export type WebPushStatus =
  'unsupported' | 'missing_vapid' | 'denied' | 'default' | 'subscribed' | 'granted_unsubscribed';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function readVapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  return key || null;
}

export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function markWebPushSubscribedLocally(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) window.localStorage.setItem(WEB_PUSH_FLAG_KEY, '1');
    else window.localStorage.removeItem(WEB_PUSH_FLAG_KEY);
  } catch {
    // private mode
  }
}

/** True when this device registered a Web Push subscription (server primary). */
export function isWebPushPrimaryActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(WEB_PUSH_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function resolveWebPushStatus(): Promise<WebPushStatus> {
  if (!isWebPushSupported()) return 'unsupported';
  if (!readVapidPublicKey()) return 'missing_vapid';
  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  const sub = await getExistingPushSubscription();
  if (sub) {
    markWebPushSubscribedLocally(true);
    return 'subscribed';
  }
  if (permission === 'granted') return 'granted_unsubscribed';
  return 'default';
}

export interface SubscribeResult {
  ok: boolean;
  status: WebPushStatus;
  error?: string;
}

/**
 * Must be called from a direct user gesture (iOS requirement).
 * requestPermission → subscribe → upsert push_subscriptions.
 */
export async function enableLiveCoachingWebPush(userId: string): Promise<SubscribeResult> {
  if (!isWebPushSupported()) {
    return { ok: false, status: 'unsupported', error: 'unsupported' };
  }
  const vapid = readVapidPublicKey();
  if (!vapid) {
    return { ok: false, status: 'missing_vapid', error: 'missing_vapid' };
  }
  if (!userId) {
    return { ok: false, status: 'default', error: 'not_authenticated' };
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission === 'denied') {
    markWebPushSubscribedLocally(false);
    return { ok: false, status: 'denied', error: 'denied' };
  }
  if (permission !== 'granted') {
    return { ok: false, status: 'default', error: 'permission_not_granted' };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }

  const saved = await persistPushSubscription(userId, sub);
  if (!saved.ok) {
    return { ok: false, status: 'granted_unsubscribed', error: saved.error };
  }
  markWebPushSubscribedLocally(true);
  return { ok: true, status: 'subscribed' };
}

export async function persistPushSubscription(
  userId: string,
  subscription: PushSubscription
): Promise<{ ok: boolean; error?: string }> {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'invalid_subscription_keys' };
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function syncExistingSubscriptionToServer(userId: string): Promise<boolean> {
  const sub = await getExistingPushSubscription();
  if (!sub || !userId) return false;
  const saved = await persistPushSubscription(userId, sub);
  if (saved.ok) markWebPushSubscribedLocally(true);
  return saved.ok;
}
