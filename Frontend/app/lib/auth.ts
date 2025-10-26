import { Platform } from 'react-native';

const DEFAULT_KEYS = ['authToken', 'token', 'refreshToken', 'user', 'EAGLEPOINT_AUTH'];

export async function logoutAndClear(options?: { baseUrl?: string }) {
  const baseUrl =
    options?.baseUrl ?? (Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000');

  // Tell server to revoke refresh token (best-effort). Use credentials to send cookies if available.
  try {
    await fetch(`${baseUrl}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch (e) {
    // ignore
  }

  // Clear web storage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      DEFAULT_KEYS.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch (e) {}

  // Clear native AsyncStorage if available
  try {
    // @ts-ignore
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage && AsyncStorage.multiRemove) {
      await AsyncStorage.multiRemove(DEFAULT_KEYS);
    }
  } catch (e) {}
}

export function saveAccessToken(token?: string) {
  try {
    if (!token) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('authToken', token);
    }
  } catch (e) {}

  try {
    // @ts-ignore
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage && AsyncStorage.setItem && token) {
      AsyncStorage.setItem('authToken', token).catch(() => {});
    }
  } catch (e) {}
}

export default { logoutAndClear, saveAccessToken };
