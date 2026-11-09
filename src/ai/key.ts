import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'anthropic-api-key';

/**
 * The API key lives only on this device: in the iOS Keychain / Android
 * Keystore via SecureStore. Never in the source code or the app bundle.
 * The web build (used for development) falls back to localStorage.
 */
export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(value: string): Promise<void> {
  const key = value.trim();
  if (Platform.OS === 'web') {
    window.localStorage.setItem(KEY, key);
    return;
  }
  await SecureStore.setItemAsync(KEY, key);
}

export async function deleteApiKey(): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

/** Show only the start and end, e.g. "sk-ant-api03-…x9Qa". */
export function maskKey(key: string): string {
  return key.length > 20 ? `${key.slice(0, 13)}…${key.slice(-4)}` : '••••';
}
