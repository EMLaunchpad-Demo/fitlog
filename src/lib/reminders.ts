import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { formatTime, parseTime } from '@/lib/time';
import type { Settings } from '@/lib/types';
import { useStore } from '@/store/store';

/**
 * Reminder notifications (Web Push), web only. The app's server
 * (worker/index.js) sends them at the chosen times, so they also arrive when
 * the app is closed. On an iPhone that only works for the app on the home
 * screen (iOS 16.4 or newer).
 */

export type ReminderId = 'weigh' | 'checkin' | 'screens' | 'bed' | 'food';

export const REMINDERS: { id: ReminderId; label: string; hint: string; onByDefault: boolean }[] = [
  { id: 'weigh', label: 'Wegen', hint: 'kort na het opstaan', onByDefault: true },
  { id: 'checkin', label: 'Check-in', hint: 'hoe sta je ervoor vandaag', onByDefault: true },
  { id: 'screens', label: 'Schermen uit', hint: 'tijd om af te bouwen', onByDefault: true },
  { id: 'bed', label: 'Bedtijd', hint: 'een kwartier voor licht uit', onByDefault: true },
  { id: 'food', label: 'Voeding nakijken', hint: 'alles gelogd vandaag?', onByDefault: false },
];

interface ReminderChoice {
  enabled: boolean;
  /** null = follow the sleep schedule */
  time: string | null;
}

interface RemindersState {
  /** The browser's push address once reminders are switched on. */
  endpoint: string | null;
  choices: Partial<Record<ReminderId, ReminderChoice>>;
}

export const useReminders = create<RemindersState>()(
  persist((): RemindersState => ({ endpoint: null, choices: {} }), {
    name: 'fitlog-reminders',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

const shift = (time: string, minutes: number) => formatTime((parseTime(time) ?? 0) + minutes);

/** When a reminder fires if the user did not pick a time: tied to the sleep schedule. */
export function defaultTime(id: ReminderId, sleep: Settings['sleep']): string {
  switch (id) {
    case 'weigh':
      return shift(sleep.wake, 10);
    case 'checkin':
      return shift(sleep.wake, 20);
    case 'screens':
      return sleep.screensOff ?? shift(sleep.bedtime, -30);
    case 'bed':
      return shift(sleep.bedtime, -15);
    case 'food':
      return '20:00';
  }
}

export function reminderChoice(
  id: ReminderId,
  choices: RemindersState['choices'],
  sleep: Settings['sleep'],
): { enabled: boolean; time: string; custom: boolean } {
  const choice = choices[id];
  return {
    enabled: choice?.enabled ?? REMINDERS.find((r) => r.id === id)!.onByDefault,
    time: choice?.time ?? defaultTime(id, sleep),
    custom: choice?.time != null,
  };
}

function message(id: ReminderId, sleep: Settings['sleep']) {
  switch (id) {
    case 'weigh':
      return { title: 'Wegen', body: 'Weeg je nu: na het toilet, voor het ontbijt.', url: '/weight' };
    case 'checkin':
      return { title: 'Check-in', body: 'Hoe sta je ervoor vandaag? Twintig seconden.', url: '/checkin' };
    case 'screens':
      return { title: 'Schermen uit', body: `Leg je schermen weg. Licht uit om ${sleep.bedtime}.`, url: '/sleep' };
    case 'bed':
      return { title: 'Bijna bedtijd', body: `Licht uit om ${sleep.bedtime}, op om ${sleep.wake}.`, url: '/sleep' };
    case 'food':
      return { title: 'Voeding', body: 'Alles gelogd vandaag? Kijk je eiwit en calorieën na.', url: '/food' };
  }
}

/** The list the server gets: only the reminders that are switched on. */
export function buildReminders(choices: RemindersState['choices'], sleep: Settings['sleep']) {
  return REMINDERS.map((r) => ({ ...r, ...reminderChoice(r.id, choices, sleep) }))
    .filter((r) => r.enabled)
    .map((r) => ({ id: r.id, time: r.time, ...message(r.id, sleep) }));
}

export type PushSupport = 'ok' | 'install-first' | 'unsupported';

export function pushSupport(): PushSupport {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'unsupported';
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  // Safari on iPhone only offers notifications to an app on the home screen.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone ? 'install-first' : 'unsupported';
}

const fromB64url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // `ready` never resolves without a service worker (local development), so do not wait forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
  ]);
}

async function register(subscription: PushSubscription): Promise<string | null> {
  const { choices } = useReminders.getState();
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      reminders: buildReminders(choices, useStore.getState().settings.sleep),
    }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error === 'subscription-limit'
    ? 'Er zijn al te veel toestellen aangemeld voor herinneringen.'
    : 'De herinneringen konden niet worden ingesteld.';
}

/** Asks for permission (must be called from a tap) and signs this device up for reminders. */
export async function enableReminders(): Promise<string | null> {
  if (pushSupport() !== 'ok') return 'Meldingen worden hier niet ondersteund.';
  try {
    if ((await Notification.requestPermission()) !== 'granted')
      return 'Meldingen zijn geweigerd. Sta ze toe voor Fitlog in de instellingen van je telefoon.';
    const reg = await registration();
    if (!reg) return 'De app is nog niet klaar voor meldingen. Sluit hem, open hem opnieuw en probeer het nog eens.';
    const res = await fetch('/api/push/key', { cache: 'no-store' });
    if (!res.ok) return 'De server voor herinneringen is op dit adres niet beschikbaar.';
    const applicationServerKey = fromB64url((await res.json()).key);
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }
    const error = await register(subscription);
    if (error) return error;
    useReminders.setState({ endpoint: subscription.endpoint });
    return null;
  } catch {
    return 'Meldingen aanzetten lukte niet. Probeer het opnieuw.';
  }
}

/** Sends the current list of reminders to the server again (after a change of times or schedule). */
export async function syncReminders(): Promise<void> {
  if (!useReminders.getState().endpoint || pushSupport() !== 'ok') return;
  try {
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    // The browser can drop a subscription (app reinstalled, permission revoked).
    if (!subscription) {
      useReminders.setState({ endpoint: null });
      return;
    }
    if (subscription.endpoint !== useReminders.getState().endpoint)
      useReminders.setState({ endpoint: subscription.endpoint });
    await register(subscription);
  } catch {
    // Offline: the next change or app start tries again.
  }
}

export async function disableReminders(): Promise<void> {
  const { endpoint } = useReminders.getState();
  useReminders.setState({ endpoint: null });
  try {
    if (endpoint)
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    const reg = await registration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // Switched off locally either way.
  }
}

/** Asks the server to send a notification right now; true when the push service accepted it. */
export async function sendTestReminder(): Promise<boolean> {
  const { endpoint } = useReminders.getState();
  if (!endpoint) return false;
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function setReminderChoice(id: ReminderId, patch: Partial<ReminderChoice>) {
  const current = useReminders.getState().choices[id];
  const onByDefault = REMINDERS.find((r) => r.id === id)!.onByDefault;
  useReminders.setState((s) => ({
    choices: {
      ...s.choices,
      [id]: { enabled: current?.enabled ?? onByDefault, time: current?.time ?? null, ...patch },
    },
  }));
}

let started = false;

/** Call once at app start: keeps the server's reminder times in step with the sleep schedule. */
export function startReminderSync() {
  if (Platform.OS !== 'web' || started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => syncReminders(), 1500);
  };
  useStore.subscribe((state, prev) => {
    if (state.settings.sleep !== prev.settings.sleep) later();
  });
  useReminders.subscribe((state, prev) => {
    if (state.choices !== prev.choices) later();
  });
  // Once per start: picks up a subscription the browser renewed or dropped.
  setTimeout(() => syncReminders(), 8000);
}
