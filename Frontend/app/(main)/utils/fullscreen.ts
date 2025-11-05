import { Platform, StatusBar as RNStatusBar } from 'react-native';

export const reloadApp = async () => {
  try {
    if (typeof window !== 'undefined' && window.location && typeof (window.location as any).reload === 'function') {
      try { (window.location as any).reload(); return; } catch {}
    }
  } catch {}

  try {
    // try common Expo reload mechanism if available
    const Updates = (() => {
      try { return require('expo-updates'); } catch { return null; }
    })();
    const upd = (Updates && (Updates as any).default) ? (Updates as any).default : Updates;
    if (upd && typeof upd.reloadAsync === 'function') {
      try { await upd.reloadAsync(); return; } catch {}
    }
  } catch {}

  try {
    const RN = require('react-native');
    const DevSettings = RN?.DevSettings ?? (RN as any)?.NativeModules?.DevSettings;
    if (DevSettings && typeof DevSettings.reload === 'function') {
      try { DevSettings.reload(); return; } catch {}
    }
  } catch {}
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
      try { await so.lockAsync(so.OrientationLock.LANDSCAPE_RIGHT); } catch {}
    }
  } catch (e) {
    /* swallow - best-effort */
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
  } catch (e) {
    /* swallow - best-effort */
  }
};

