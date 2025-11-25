import { Platform, StatusBar as RNStatusBar } from 'react-native';

export const reloadApp = async () => {
  try {
    if (typeof window !== 'undefined' && window.location && typeof (window.location as any).reload === 'function') {
      try { (window.location as any).reload(); return; } catch {}
    }
  } catch (e) { void e; }

  try {
    // try common Expo reload mechanism if available
    // eslint-disable-next-line import/no-unresolved
    const UpdatesModule = await import('expo-updates').catch(() => null);
    const upd = (UpdatesModule && (UpdatesModule as any).default) ? (UpdatesModule as any).default : UpdatesModule;
    if (upd && typeof upd.reloadAsync === 'function') {
      try { await upd.reloadAsync(); return; } catch (_e) { void _e; }
    }
  } catch (e) { void e; }

    try {
      const RNModule = await import('react-native').catch(() => null);
      const RN: any = RNModule?.default ?? RNModule;
      const DevSettings = RN?.DevSettings ?? (RN as any)?.NativeModules?.DevSettings;
      if (DevSettings && typeof DevSettings.reload === 'function') {
        try { DevSettings.reload(); return; } catch (_e) { void _e; }
      }
    } catch (_e) { void _e; }
};

export const enterFullScreen = async () => {
  try {
    try { RNStatusBar.setHidden(true); } catch {}

    if (Platform.OS === 'android') {
      const navModule = await import('expo-navigation-bar').catch(() => null);
      const nav: any = navModule?.default ?? navModule;
      if (nav && nav.setBehaviorAsync) {
        try { await nav.setBehaviorAsync('immersive-sticky'); } catch {}
        try { await nav.setVisibilityAsync('hidden'); } catch {}
      }
    }

    const soModule = await import('expo-screen-orientation').catch(() => null);
    const so: any = soModule?.default ?? soModule;
    if (so && so.lockAsync && so.OrientationLock) {
      try { await so.lockAsync(so.OrientationLock.LANDSCAPE); } catch {}
    }
  } catch (_e) {
    void _e; /* swallow - best-effort */
  }
};

export const exitFullScreen = async () => {
  try {
    try { RNStatusBar.setHidden(false); } catch {}

    if (Platform.OS === 'android') {
      const navModule = await import('expo-navigation-bar').catch(() => null);
      const nav: any = navModule?.default ?? navModule;
      if (nav && nav.setVisibilityAsync) {
        try { await nav.setVisibilityAsync('visible'); } catch {}
        try { await nav.setBehaviorAsync('overlay'); } catch {}
      }
    }

    const soModule = await import('expo-screen-orientation').catch(() => null);
    const so: any = soModule?.default ?? soModule;
    if (so && so.lockAsync && so.OrientationLock) {
      try { await so.lockAsync(so.OrientationLock.DEFAULT); } catch {}
    }
  } catch (_e) {
    void _e; /* swallow - best-effort */
  }
};

// expo-router treats files under `app/` as routes and warns when a module
// doesn't export a default React component. This file provides only helpers,
// but to silence that warning we add a harmless default export. This
// component is never rendered at runtime.
export default function _FullscreenHelper() {
  return null;
}

