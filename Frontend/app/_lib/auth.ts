import { Platform } from 'react-native';

// Intentional: only named exports. Remove default export to avoid import/no-named-as-default-member warnings.

// Provide a harmless default export so Expo Router won't treat this file as a broken route.
import React from 'react';

const DEFAULT_KEYS = ['authToken', 'token', 'refreshToken', 'user', 'EAGLEPOINT_AUTH'];

export async function logoutAndClear(options?: { baseUrl?: string }) {
  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const baseUrl = options?.baseUrl ?? (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;

  // Tell server to revoke refresh token (best-effort). Use credentials to send cookies if available.
  try {
    await fetch(`${baseUrl}/logout`, { method: 'POST', credentials: 'include' }).catch(() => null);
  } catch (_e) { void _e; // ignore
  }

  // Clear web storage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      DEFAULT_KEYS.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch (_e) { void _e; }

  // Clear native AsyncStorage if available
  try {
    // @ts-ignore
    // runtime require - disable the lint rule for this line
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage && AsyncStorage.multiRemove) {
      await AsyncStorage.multiRemove(DEFAULT_KEYS);
    }
  } catch (_e) { void _e; }
}

export function saveAccessToken(token?: string) {
  // NOTE: For development it's acceptable to persist access tokens in
  // AsyncStorage/localStorage for convenience. For production/native apps
  // store refresh/access tokens in secure storage (Keychain/Keystore) such
  // as react-native-keychain or expo-secure-store to reduce risk of token theft.
  try {
    if (!token) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('authToken', token);
    }
  } catch (_e) { void _e; }

  try {
    // @ts-ignore
    // runtime require - disable the lint rule for this line
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage && AsyncStorage.setItem && token) {
      AsyncStorage.setItem('authToken', token).catch(() => {});
    }
  } catch {}
}
const _HiddenAuthHelper: React.FC = () => null;
export default _HiddenAuthHelper;
