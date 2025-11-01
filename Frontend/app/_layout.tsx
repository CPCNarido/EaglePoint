import { Stack } from "expo-router";
import React, { useEffect } from 'react';
import { SettingsProvider } from './_lib/SettingsProvider';
import { useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
  const { width, height } = useWindowDimensions();
  // simple tablet heuristic: largest side >= 900 (adjust if you prefer a different cutoff)
  const isTablet = Math.max(width, height) >= 900;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      try {
        if (isTablet) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch (e) {
        // ignore orientation lock errors in dev or unsupported environments
        // console.warn('Orientation lock failed', e);
      }
    })();
    return () => {
      mounted = false;
      // attempt to restore default when layout unmounts
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [isTablet]);

  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SettingsProvider>
  );
}
