import { useCallback, useEffect, useState } from 'react';
import { getToken } from '@/lib/adminApi';

const PUSH_URL = 'https://functions.poehali.dev/0ec4537a-eb53-4f31-b9a4-19afa2eff83a';
const SW_PATH = '/sw.js';

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

async function getVapidKey(): Promise<string> {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vapid_public' }),
  });
  const data = await res.json();
  return data.vapid_public_key || '';
}

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          setSubscription(sub);
          setState('subscribed');
        } else {
          setState('unsubscribed');
        }
      });
    }).catch(() => setState('unsubscribed'));
  }, []);

  const subscribe = useCallback(async () => {
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return false;
      }

      const reg = await registerSW();
      if (!reg) { setState('unsupported'); return false; }

      const vapidKey = await getVapidKey();
      if (!vapidKey) { setState('unsubscribed'); return false; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = sub.toJSON();
      const token = getToken();
      await fetch(PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({
          action: 'subscribe',
          endpoint: sub.endpoint,
          p256dh: (subJson.keys as Record<string, string>)?.p256dh || '',
          auth: (subJson.keys as Record<string, string>)?.auth || '',
        }),
      });

      setSubscription(sub);
      setState('subscribed');
      return true;
    } catch {
      setState('unsubscribed');
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState('loading');
    try {
      if (subscription) {
        const token = getToken();
        await fetch(PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
          body: JSON.stringify({ action: 'unsubscribe', endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        setSubscription(null);
      }
      setState('unsubscribed');
    } catch {
      setState('unsubscribed');
    }
  }, [subscription]);

  return { state, subscribe, unsubscribe };
}