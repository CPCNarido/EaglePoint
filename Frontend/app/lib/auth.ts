import { Platform } from 'react-native';

const DEFAULT_KEYS = ['authToken', 'token', 'refreshToken', 'user', 'EAGLEPOINT_AUTH'];

export async function logoutAndClear(options?: { baseUrl?: string }) {
  const baseDefault = Platform.OS === 'android' ? 'http://10.127.147.53:3000' : 'http://localhost:3000';
  const baseUrl = options?.baseUrl ?? (global as any).__EAGLEPOINT_BASE_URL__ ?? baseDefault;

  // Tell server to revoke refresh token (best-effort). Use credentials to send cookies if available.
  try {
    await fetch(`${baseUrl}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch {
    // ignore
  }

  // Clear web storage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      DEFAULT_KEYS.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch {}

  // Clear native AsyncStorage if available
  try {
    // @ts-ignore
    // runtime require - disable the lint rule for this line
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage && AsyncStorage.multiRemove) {
      await AsyncStorage.multiRemove(DEFAULT_KEYS);
    }
  } catch {}
}

export function saveAccessToken(token?: string) {
  try {
    if (!token) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('authToken', token);
    }
  } catch {}

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

// Intentional: only named exports. Remove default export to avoid import/no-named-as-default-member warnings.

// Provide a harmless default export so Expo Router doesn't treat this module as a broken route
// (some bundlers will warn if a file under `app/` is not a route component). This export
// is never used at runtime — we keep only named exports for programmatic usage.
// Export a simple null value to avoid importing React or declaring duplicate identifiers.
export default null as any;
