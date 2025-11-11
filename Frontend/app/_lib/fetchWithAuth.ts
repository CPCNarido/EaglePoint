import { Platform } from 'react-native';

// Helper to call fetch and automatically attach Authorization header when an
// access token is saved in localStorage (web) or AsyncStorage (native).
export async function fetchWithAuth(input: RequestInfo, init?: RequestInit) {
  const opts: RequestInit = { ...(init || {}) };

  // default to include credentials so cookie-based refresh flows continue to work
  if (opts.credentials === undefined) opts.credentials = 'include';

  // If caller already provided Authorization header, respect it.
  const existingAuth = (opts.headers && (opts.headers as any)['Authorization']) || (opts.headers && (opts.headers as any)['authorization']);
  if (!existingAuth) {
    try {
      // Try web localStorage first
      if (typeof window !== 'undefined' && window.localStorage) {
        const t = window.localStorage.getItem('authToken');
        if (t) {
          opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${t}` } as any;
          return fetch(input, opts);
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      // Try native AsyncStorage if available
      // @ts-ignore
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (AsyncStorage && AsyncStorage.getItem) {
        const t = await AsyncStorage.getItem('authToken').catch(() => null);
        if (t) {
          opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${t}` } as any;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return fetch(input, opts);
}

// Intentionally no default export: keep as a named export to avoid being treated
// as a route component by bundlers that expect default exports in `app/`.
