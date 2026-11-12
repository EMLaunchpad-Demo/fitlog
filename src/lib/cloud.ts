import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DATA_KEYS, makeBackup, restoreBackup, summarizeBackup } from '@/lib/backup';
import { useStore } from '@/store/store';

/**
 * Automatic backup to the app's own server (worker/index.js), web only.
 *
 * The backup is encrypted on the device before it leaves it. The key comes
 * from a recovery code that only the user has; the server stores ciphertext
 * under an id that is also derived from the code, so it cannot read anything
 * and there is no account or password. Whoever has the code can restore the
 * backup, so it has to be kept safe; without it the backup cannot be opened.
 */

export type CloudStatus = 'idle' | 'syncing' | 'ok' | 'conflict' | 'error';

interface CloudState {
  /** The recovery code; null while automatic backup is off. */
  code: string | null;
  /** Version of the backup on the server this device last saw. */
  remoteUpdatedAt: number | null;
  lastUploadAt: number | null;
  /** Something changed since the last upload. */
  dirty: boolean;
  status: CloudStatus;
  error: string | null;
}

export const useCloud = create<CloudState>()(
  persist(
    (): CloudState => ({
      code: null,
      remoteUpdatedAt: null,
      lastUploadAt: null,
      dirty: false,
      status: 'idle',
      error: null,
    }),
    {
      name: 'fitlog-cloud',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        code: s.code,
        remoteUpdatedAt: s.remoteUpdatedAt,
        lastUploadAt: s.lastUploadAt,
        dirty: s.dirty,
      }),
    },
  ),
);

/** Browsers only: needs WebCrypto, which React Native does not have. */
export const CLOUD_SUPPORTED =
  Platform.OS === 'web' && typeof crypto !== 'undefined' && !!crypto.subtle;

// ───────────────────────── Recovery code ─────────────────────────

/** No 0, 1, I, L, O or U: nothing that is easy to misread or mistype. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 20 characters, about 98 bits: far beyond guessing. */
export function generateCode(): string {
  const out: string[] = [];
  // Rejection sampling keeps every character equally likely.
  while (out.length < 20) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0];
    if (byte < 240) out.push(ALPHABET[byte % ALPHABET.length]);
  }
  return formatCode(out.join(''));
}

export function normalizeCode(text: string): string {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function formatCode(code: string): string {
  return normalizeCode(code).replace(/(.{5})(?=.)/g, '$1-');
}

export function isValidCode(text: string): boolean {
  const c = normalizeCode(text);
  return c.length === 20 && [...c].every((ch) => ALPHABET.includes(ch));
}

// ───────────────────────── Encryption ─────────────────────────

const utf8 = (text: string) => new TextEncoder().encode(text);
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** From the code: the encryption key (stays on the device) and the id the server files the backup under. */
async function deriveKeys(code: string): Promise<{ key: CryptoKey; vault: string }> {
  const material = await crypto.subtle.importKey('raw', utf8(normalizeCode(code)), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: utf8('fitlog-sync-v1'), iterations: 150_000 },
      material,
      512,
    ),
  );
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  // The id is a hash of the other half, so it reveals nothing about the key.
  const vault = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(32))).slice(0, 20));
  return { key, vault };
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Compress (where the browser can), then AES-GCM. Layout: flag, 12-byte nonce, ciphertext. */
async function encrypt(key: CryptoKey, text: string): Promise<string> {
  let plain = utf8(text);
  let flag = 0;
  if (typeof CompressionStream !== 'undefined') {
    plain = await pipe(plain, new CompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>);
    flag = 1;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource),
  );
  const out = new Uint8Array(1 + iv.length + cipher.length);
  out[0] = flag;
  out.set(iv, 1);
  out.set(cipher, 13);
  return toBase64(out);
}

async function decrypt(key: CryptoKey, data: string): Promise<string> {
  const bytes = fromBase64(data);
  let plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(1, 13) }, key, bytes.slice(13)),
  );
  if (bytes[0] === 1)
    plain = await pipe(plain, new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>);
  return new TextDecoder().decode(plain);
}

// ───────────────────────── Talking to the server ─────────────────────────

/** True when this address has the backup server behind it (not the case in local development). */
export async function cloudAvailable(): Promise<boolean> {
  if (!CLOUD_SUPPORTED) return false;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

const MESSAGES: Record<string, string> = {
  'vault-limit':
    'Op deze server staan al het maximum aantal back-ups. Gebruik je bestaande herstelcode.',
  'too-large': 'Je back-up is te groot geworden voor de automatische back-up.',
  unavailable: 'De back-upserver is op dit adres niet beschikbaar.',
};

/** Encrypts everything and saves it on the server. `force` overwrites a newer backup from another device. */
export async function uploadBackup(force = false): Promise<CloudStatus> {
  const { code, remoteUpdatedAt, status } = useCloud.getState();
  if (!code || status === 'syncing') return status;
  useCloud.setState({ status: 'syncing', error: null });
  try {
    const { key, vault } = await deriveKeys(code);
    const data = await encrypt(key, makeBackup());
    const res = await fetch(`/api/sync/${vault}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data, baseUpdatedAt: remoteUpdatedAt, force }),
    });
    const body = (await res.json().catch(() => ({}))) as { updatedAt?: number; error?: string };
    if (res.status === 409) {
      useCloud.setState({ status: 'conflict' });
      return 'conflict';
    }
    if (!res.ok || !body.updatedAt) {
      useCloud.setState({
        status: 'error',
        error: MESSAGES[body.error ?? ''] ?? 'De back-up kon niet worden opgeslagen.',
      });
      return 'error';
    }
    useCloud.setState({
      status: 'ok',
      remoteUpdatedAt: body.updatedAt,
      lastUploadAt: Date.now(),
      dirty: false,
    });
    return 'ok';
  } catch {
    useCloud.setState({ status: 'error', error: 'Geen verbinding. De back-up volgt zodra je online bent.' });
    return 'error';
  }
}

export type Download =
  | { ok: true; json: string; updatedAt: number; summary: string }
  | { ok: false; error: string };

/** Fetches and decrypts the backup that belongs to a recovery code. Changes nothing yet. */
export async function downloadBackup(code: string): Promise<Download> {
  if (!isValidCode(code)) return { ok: false, error: 'Deze herstelcode klopt niet: het zijn 20 tekens.' };
  try {
    const { key, vault } = await deriveKeys(code);
    const res = await fetch(`/api/sync/${vault}`, { cache: 'no-store' });
    if (res.status === 404)
      return { ok: false, error: 'Bij deze code is geen back-up gevonden. Kijk de code na.' };
    if (!res.ok) return { ok: false, error: 'De back-up kon niet worden opgehaald.' };
    const stored = (await res.json()) as { updatedAt: number; data: string };
    const json = await decrypt(key, stored.data);
    const check = summarizeBackup(json);
    if (!check.ok) return { ok: false, error: check.error };
    return { ok: true, json, updatedAt: stored.updatedAt, summary: check.summary };
  } catch {
    return { ok: false, error: 'De back-up kon niet worden gelezen. Check je internet en de code.' };
  }
}

/** Switches automatic backup on with a fresh code and makes the first backup. */
export async function enableCloud(): Promise<string> {
  const code = generateCode();
  useCloud.setState({ code, remoteUpdatedAt: null, lastUploadAt: null, dirty: true, status: 'idle', error: null });
  await uploadBackup();
  return code;
}

/** Replaces this device's data with a downloaded backup and keeps syncing with that code. */
export function applyDownload(code: string, download: Extract<Download, { ok: true }>): boolean {
  const result = restoreBackup(download.json);
  if (!result.ok) return false;
  useCloud.setState({
    code: formatCode(code),
    remoteUpdatedAt: download.updatedAt,
    lastUploadAt: Date.now(),
    dirty: false,
    status: 'ok',
    error: null,
  });
  return true;
}

/** Switches automatic backup off; `wipe` also deletes the copy on the server. */
export async function disableCloud(wipe: boolean): Promise<void> {
  const { code } = useCloud.getState();
  if (code && wipe) {
    try {
      const { vault } = await deriveKeys(code);
      await fetch(`/api/sync/${vault}`, { method: 'DELETE' });
    } catch {
      // The local switch-off still goes through.
    }
  }
  useCloud.setState({ code: null, remoteUpdatedAt: null, lastUploadAt: null, dirty: false, status: 'idle', error: null });
}

// ───────────────────────── Automatic ─────────────────────────

/** At most one upload per two minutes while things are changing. */
const MIN_INTERVAL_MS = 2 * 60_000;
let started = false;

function maybeUpload(minInterval = MIN_INTERVAL_MS) {
  const s = useCloud.getState();
  if (!s.code || !s.dirty || s.status === 'syncing' || s.status === 'conflict') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (Date.now() - (s.lastUploadAt ?? 0) < minInterval) return;
  uploadBackup().catch(() => {});
}

/** Call once at app start: watches for changes and backs them up in the background. */
export function startCloudSync() {
  if (!CLOUD_SUPPORTED || started) return;
  started = true;
  useStore.subscribe((state, prev) => {
    if (!useCloud.getState().code || useCloud.getState().dirty) return;
    if (DATA_KEYS.some((k) => state[k] !== prev[k])) useCloud.setState({ dirty: true });
  });
  setTimeout(maybeUpload, 5000);
  setInterval(maybeUpload, 30_000);
  // Leaving the app is the last chance to save what was just logged.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') maybeUpload(20_000);
  });
}
