import { Stack } from "expo-router";
import React, { useEffect } from 'react';
import SettingsProvider from './lib/SettingsProvider';
import { enterFullScreen, exitFullScreen } from './(main)/utils/fullscreen';
import { Keyboard, Platform } from 'react-native';

export default function RootLayout() {
  useEffect(() => {
    let mounted = true;

    // Try to enter full-screen on start
    (async () => {
      if (!mounted) return;
      try {
        await enterFullScreen();
      } catch {}
    })();

    // When the keyboard opens on many Android/tablet setups while in immersive mode,
    // the OS may pan the entire window causing content to shift unexpectedly. As a
    // pragmatic fix, exit immersive/fullscreen while the keyboard is visible so the
    // system can handle resizing; re-enter fullscreen on keyboard hide.
    const onKeyboardShow = async () => {
      try {
        // Only do this on platforms where immersive mode impacts keyboard behavior
        await exitFullScreen();
      } catch {}
    };
    const onKeyboardHide = async () => {
      try {
        await enterFullScreen();
      } catch {}
    };

    const showSub = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onKeyboardHide);

    return () => {
      mounted = false;
      try { showSub.remove(); } catch {}
      try { hideSub.remove(); } catch {}
      // restore UI on unmount
      exitFullScreen().catch(() => {});
    };
  }, []);

  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SettingsProvider>
  );
}
